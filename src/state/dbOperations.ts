import * as _ from "lodash";
import * as prisma from "@prisma/client";
import { strict as assert } from "assert";

import {
  AccountId,
  ChainId,
  MakerBalanceId,
  MakerBalanceVersionId,
  MangroveId,
  MangroveVersionId,
  OfferId,
  OfferListId,
  OfferListVersionId,
  OfferVersionId,
  OrderId,
  OrderSummaryId,
  TakerApprovalId,
  TakerApprovalVersionId,
  TokenId,
  TransactionId,
} from "./model";
import { Timestamp } from "@proximaone/stream-client-js";

export class DbOperations {
  public constructor(private readonly tx: PrismaTx) {}

  public async getChainId(mangroveId: MangroveId): Promise<ChainId> {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: mangroveId.value },
      select: { chainId: true },
    });
    if (mangrove === null) {
      throw new Error(`Mangrove not found, id: ${mangroveId.value}`);
    }
    return new ChainId(mangrove.chainId);
  }

  public async ensureTransaction(
    id: TransactionId,
    txHash: string,
    from: string,
    timestamp: Timestamp,
    blockNumber: number,
    blockHash: string
  ): Promise<prisma.Transaction> {
    let transaction = await this.tx.transaction.findUnique({
      where: { id: id.value },
    });
    if (transaction === null) {
      transaction = {
        id: id.value,
        chainId: id.chainId.value,
        txHash: txHash,
        from: from,
        blockNumber: blockNumber,
        blockHash: blockHash,
        time: timestamp.date,
      };
      await this.tx.transaction.create({ data: transaction });
    }
    return transaction;
  }

  public async ensureAccount(id: AccountId): Promise<prisma.Account> {
    let account = await this.tx.account.findUnique({ where: { id: id.value } });
    if (account == undefined) {
      account = {
        id: id.value,
        chainId: id.chainId.value,
        address: id.address,
      };
      await this.tx.account.create({ data: account });
    }
    return account;
  }

  public async ensureChain(id: ChainId, name: string): Promise<prisma.Chain> {
    let chain = await this.tx.chain.findUnique({
      where: { id: id.chainlistId },
    });
    if (chain == undefined) {
      chain = {
        id: id.value,
        name: name,
      };
      await this.tx.chain.create({ data: chain });
    }
    return chain;
  }

  public async assertTokenExists(id: TokenId): Promise<void> {
    const token = await this.tx.token.findUnique({
      where: { id: id.value },
    });
    if (token == undefined) {
      throw new Error(`token ${id.value} doesn't exist`);
    }
  }

  public async getOfferListTokens(
    id: OfferListId
  ): Promise<{ outboundToken: prisma.Token; inboundToken: prisma.Token }> {
    const offerList = await this.tx.offerList.findUnique({
      where: { id: id.value },
      include: {
        outboundToken: true,
        inboundToken: true,
      },
    });
    if (offerList === null) {
      throw new Error(
        `offer list ${id.value} doesn't exist - chainId=${id.mangroveId.chainId.chainlistId}, mangroveId=${id.mangroveId.value}, outboundToken=${id.offerListKey.outboundToken},  inboundToken=${id.offerListKey.inboundToken}`
      );
    }
    return {
      outboundToken: offerList!.outboundToken,
      inboundToken: offerList!.inboundToken,
    };
  }

  public async getOffer(id: OfferId): Promise<prisma.Offer | null> {
    return await this.tx.offer.findUnique({ where: { id: id.value } });
  }

  public async markOfferAsDeleted(id: OfferId) {
    await this.tx.offer.update({
      where: { id: id.value },
      data: { deleted: true },
    });
  }

  public async markOfferAsUndeleted(id: OfferId) {
    await this.tx.offer.update({
      where: { id: id.value },
      data: { deleted: false },
    });
  }

  // Add a new OfferVersion to a (possibly new) Offer
  public async addVersionedOffer(
    id: OfferId,
    offer: Omit<prisma.Offer, "deleted" | "currentVersionId">,
    version: Omit<
      prisma.OfferVersion,
      "id" | "offerId" | "versionNumber" | "prevVersionId"
    >
  ) {
    const oldVersionId = (await this.getOffer(id))?.currentVersionId;

    let oldVersion: prisma.OfferVersion | null = null;
    if (oldVersionId !== undefined) {
      oldVersion = await this.tx.offerVersion.findUnique({
        where: { id: oldVersionId },
      });
      if (oldVersion === null) {
        throw new Error(`Old OfferVersion not found, id: ${oldVersion}`);
      }
    }

    const newVersionNumber =
      oldVersion === null ? 0 : oldVersion.versionNumber + 1;
    const newVersionId = new OfferVersionId(id, newVersionNumber);

    await this.tx.offer.upsert(
      toUpsert<prisma.Offer>(
        _.merge(offer, {
          currentVersionId: newVersionId.value,
          deleted: false,
        })
      )
    );

    await this.tx.offerVersion.create({
      data: _.merge(version, {
        id: newVersionId.value,
        offerId: offer.id,
        versionNumber: newVersionNumber,
        prevVersionId: oldVersionId,
      }),
    });
  }

  public async deleteLatestOfferVersion(id: OfferId) {
    const offer = await this.tx.offer.findUnique({ where: { id: id.value } });
    if (offer === null) throw Error(`Offer not found - id: ${id.value}`);

    const version = await this.tx.offerVersion.findUnique({
      where: { id: offer.currentVersionId },
    });
    await this.tx.offerVersion.delete({
      where: { id: offer.currentVersionId },
    });

    if (version!.prevVersionId === null) {
      await this.tx.offer.delete({ where: { id: id.value } });
    } else {
      offer.currentVersionId = version!.prevVersionId;
      await this.tx.offer.update({ where: { id: id.value }, data: offer });
    }
  }

  // Add a new OfferListVersion to a (possibly new) OfferList
  public async addVersionedOfferList(
    id: OfferListId,
    tx: prisma.Transaction,
    updateFunc: (model: prisma.OfferListVersion) => void
  ) {
    let offerList: prisma.OfferList | null = await this.tx.offerList.findUnique(
      {
        where: { id: id.value },
      }
    );
    let newVersion: prisma.OfferListVersion;

    if (offerList === null) {
      const mangrove = await this.tx.mangrove.findUnique({
        where: { id: id.mangroveId.value },
      });
      const chainId = new ChainId(mangrove!.chainId);
      const inboundTokenId = new TokenId(chainId, id.offerListKey.inboundToken);
      const outboundTokenId = new TokenId(
        chainId,
        id.offerListKey.outboundToken
      );
      const newVersionId = new OfferListVersionId(id, 0);
      offerList = {
        id: id.value,
        mangroveId: id.mangroveId.value,
        outboundTokenId: outboundTokenId.value,
        inboundTokenId: inboundTokenId.value,
        currentVersionId: newVersionId.value,
      };
      newVersion = {
        id: newVersionId.value,
        offerListId: id.value,
        txId: tx.id,
        versionNumber: 0,
        prevVersionId: null,
        active: null,
        density: null,
        gasbase: null,
        fee: null,
      };
    } else {
      const oldVersionId = offerList.currentVersionId;
      const oldVersion = await this.tx.offerListVersion.findUnique({
        where: { id: oldVersionId },
      });
      if (oldVersion === null) {
        throw new Error(`Old OfferListVersion not found, id: ${oldVersionId}`);
      }
      const newVersionNumber = oldVersion.versionNumber + 1;
      const newVersionId = new OfferListVersionId(id, newVersionNumber);
      newVersion = _.merge(oldVersion, {
        id: newVersionId.value,
        versionNumber: newVersionNumber,
        prevVersionId: oldVersionId,
      });
    }

    updateFunc(newVersion);

    await this.tx.offerList.upsert(
      toUpsert(
        _.merge(offerList, {
          currentVersionId: newVersion.id,
        })
      )
    );

    await this.tx.offerListVersion.create({ data: newVersion });
  }

  public async deleteLatestOfferListVersion(id: OfferListId) {
    const offerList = await this.tx.offerList.findUnique({
      where: { id: id.value },
    });
    if (offerList === null)
      throw Error(`OfferList not found - id: ${id.value}`);

    const offerListVersion = await this.tx.offerListVersion.findUnique({
      where: { id: offerList.currentVersionId },
    });
    await this.tx.offerListVersion.delete({
      where: { id: offerList.currentVersionId },
    });

    if (offerListVersion!.prevVersionId === null) {
      await this.tx.offerList.delete({ where: { id: id.value } });
    } else {
      offerList.currentVersionId = offerListVersion!.prevVersionId;
      await this.tx.offerList.update({
        where: { id: id.value },
        data: offerList,
      });
    }
  }

  public async deleteOrder(id: OrderId) {
    await this.tx.order.deleteMany({ where: { id: id.value } });
  }

  public async createMangrove(
    id: MangroveId,
    chainId: ChainId,
    address: string,
    tx?: prisma.Transaction
  ) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id.value },
    });

    if (!mangrove) {
      const newVersionId = new MangroveVersionId(id, 0);
      await this.tx.mangrove.create({
        data: {
          id: id.value,
          chainId: chainId.value,
          address: address,
          currentVersionId: newVersionId.value,
        },
      });
      await this.tx.mangroveVersion.create({
        data: {
          id: newVersionId.value,
          mangroveId: id.value,
          txId: tx === undefined ? null : tx.id,
          versionNumber: 0,
          prevVersionId: null,
          governance: null,
          monitor: null,
          vault: null,
          useOracle: null,
          notify: null,
          gasmax: null,
          gasprice: null,
          dead: null,
        },
      });
    }
  }

  // Add a new MangroveVersion to an existing Mangrove
  public async addVersionedMangrove(
    id: MangroveId,
    updateFunc: (model: prisma.MangroveVersion) => void,
    tx?: prisma.Transaction
  ) {
    const mangrove: prisma.Mangrove | null = await this.tx.mangrove.findUnique({
      where: { id: id.value },
    });
    assert(mangrove);

    const oldVersionId = mangrove.currentVersionId;
    const oldVersion = await this.tx.mangroveVersion.findUnique({
      where: { id: oldVersionId },
    });
    if (oldVersion === null) {
      throw new Error(`Old MangroveVersion not found, id: ${oldVersionId}`);
    }
    const newVersionNumber = oldVersion.versionNumber + 1;
    const newVersionId = new MangroveVersionId(id, newVersionNumber);
    const newVersion = _.merge(oldVersion, {
      id: newVersionId.value,
      txId: tx === undefined ? null : tx.id,
      versionNumber: newVersionNumber,
      prevVersionId: oldVersionId,
    });

    updateFunc(newVersion);

    await this.tx.mangrove.upsert(
      toUpsert(
        _.merge(mangrove, {
          currentVersionId: newVersion.id,
        })
      )
    );

    await this.tx.mangroveVersion.create({ data: newVersion });
  }

  public async deleteLatestMangroveVersion(id: MangroveId) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id.value },
    });
    if (mangrove === null) {
      throw Error(`Mangrove not found - id: ${id}`);
    }

    const mangroveVersion = await this.tx.mangroveVersion.findUnique({
      where: { id: mangrove.currentVersionId },
    });
    await this.tx.mangroveVersion.delete({
      where: { id: mangrove.currentVersionId },
    });

    if (mangroveVersion!.prevVersionId === null) {
      await this.tx.mangrove.delete({ where: { id: id.value } });
    } else {
      mangrove.currentVersionId = mangroveVersion!.prevVersionId;
      await this.tx.mangrove.update({
        where: { id: id.value },
        data: mangrove,
      });
    }
  }

  // Add a new MakerBalanceVersion to a (possibly new) MakerBalance
  public async addVersionedMakerBalance(
    id: MakerBalanceId,
    tx: prisma.Transaction,
    updateFunc: (model: prisma.MakerBalanceVersion) => void
  ) {
    let makerBalance: prisma.MakerBalance | null =
      await this.tx.makerBalance.findUnique({
        where: { id: id.value },
      });
    let newVersion: prisma.MakerBalanceVersion;

    if (makerBalance === null) {
      const newVersionId = new MakerBalanceVersionId(id, 0);
      makerBalance = {
        id: id.value,
        mangroveId: id.mangroveId.value,
        makerId: new AccountId(id.mangroveId.chainId, id.address).value,
        currentVersionId: newVersionId.value,
      };
      newVersion = {
        id: newVersionId.value,
        makerBalanceId: id.value,
        txId: tx.id,
        versionNumber: 0,
        prevVersionId: null,
        balance: "0",
      };
    } else {
      const oldVersionId = makerBalance.currentVersionId;
      const oldVersion = await this.tx.makerBalanceVersion.findUnique({
        where: { id: oldVersionId },
      });
      if (oldVersion === null) {
        throw new Error(
          `Old MakerBalanceVersion not found, id: ${oldVersionId}`
        );
      }
      const newVersionNumber = oldVersion.versionNumber + 1;
      const newVersionId = new MakerBalanceVersionId(id, newVersionNumber);
      newVersion = _.merge(oldVersion, {
        id: newVersionId.value,
        versionNumber: newVersionNumber,
        prevVersionId: oldVersionId,
      });
    }

    updateFunc(newVersion);

    await this.tx.makerBalance.upsert(
      toUpsert(
        _.merge(makerBalance, {
          currentVersionId: newVersion.id,
        })
      )
    );

    await this.tx.makerBalanceVersion.create({ data: newVersion });
  }

  public async deleteLatestMakerBalanceVersion(id: MakerBalanceId) {
    const makerBalance = await this.tx.makerBalance.findUnique({
      where: { id: id.value },
    });
    if (makerBalance === null)
      throw Error(`MakerBalance not found - id: ${id.value}`);

    const currentVersion = await this.tx.makerBalanceVersion.findUnique({
      where: { id: makerBalance.currentVersionId },
    });
    await this.tx.makerBalanceVersion.delete({
      where: { id: makerBalance.currentVersionId },
    });

    if (currentVersion!.prevVersionId === null) {
      await this.tx.makerBalance.delete({ where: { id: id.value } });
    } else {
      makerBalance.currentVersionId = currentVersion!.prevVersionId;
      await this.tx.makerBalance.update({
        where: { id: id.value },
        data: makerBalance,
      });
    }
  }

  // Add a new TakerApprovalVersion to a (possibly new) TakerApproval
  public async addVersionedTakerApproval(
    id: TakerApprovalId,
    tx: prisma.Transaction,
    updateFunc: (model: prisma.TakerApprovalVersion) => void,
    parentOrderId?: OrderId
  ) {
    let takerApproval: prisma.TakerApproval | null =
      await this.tx.takerApproval.findUnique({
        where: { id: id.value },
      });
    let newVersion: prisma.TakerApprovalVersion;

    if (takerApproval === null) {
      const newVersionId = new TakerApprovalVersionId(id, 0);
      takerApproval = {
        id: id.value,
        mangroveId: id.mangroveId.value,
        ownerId: new AccountId(id.mangroveId.chainId, id.ownerAddress).value,
        spenderId: new AccountId(id.mangroveId.chainId, id.spenderAddress)
          .value,
        offerListId: new OfferListId(id.mangroveId, id.offerListKey).value,
        currentVersionId: newVersionId.value,
      };
      newVersion = {
        id: newVersionId.value,
        takerApprovalId: id.value,
        txId: tx.id,
        parentOrderId: parentOrderId?.value ?? null,
        versionNumber: 0,
        prevVersionId: null,
        value: "0",
      };
    } else {
      const oldVersionId = takerApproval.currentVersionId;
      const oldVersion = await this.tx.takerApprovalVersion.findUnique({
        where: { id: oldVersionId },
      });
      if (oldVersion === null) {
        throw new Error(
          `Old TakerApprovalVersion not found, id: ${oldVersionId}`
        );
      }
      const newVersionNumber = oldVersion.versionNumber + 1;
      const newVersionId = new TakerApprovalVersionId(id, newVersionNumber);
      newVersion = _.merge(oldVersion, {
        id: newVersionId.value,
        versionNumber: newVersionNumber,
        prevVersionId: oldVersionId,
      });
    }

    updateFunc(newVersion);

    await this.tx.takerApproval.upsert(
      toUpsert(
        _.merge(takerApproval, {
          currentVersionId: newVersion.id,
        })
      )
    );

    await this.tx.takerApprovalVersion.create({ data: newVersion });
  }

  public async deleteLatestTakerApprovalVersion(id: TakerApprovalId) {
    const takerApproval = await this.tx.takerApproval.findUnique({
      where: { id: id.value },
    });
    if (takerApproval === null)
      throw Error(`TakerApproval not found - id: ${id.value}`);

    const currentVersion = await this.tx.takerApprovalVersion.findUnique({
      where: { id: takerApproval.currentVersionId },
    });
    await this.tx.takerApprovalVersion.delete({
      where: { id: takerApproval.currentVersionId },
    });

    if (currentVersion!.prevVersionId === null) {
      await this.tx.takerApproval.delete({ where: { id: id.value } });
    } else {
      takerApproval.currentVersionId = currentVersion!.prevVersionId;
      await this.tx.takerApproval.update({
        where: { id: id.value },
        data: takerApproval,
      });
    }
  }

  // strats

  public async createOrderSummary(
    orderSummary: prisma.OrderSummary
  ): Promise<prisma.OrderSummary> {
    return await this.tx.orderSummary.create({ data: orderSummary });
  }

  public async deleteOrderSummary(id: OrderSummaryId) {
    this.tx.orderSummary.delete({ where: { id: id.value } });
  }
}

type PrismaTx = Omit<
  prisma.PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;

function toUpsert<T extends { id: string | number }>(entity: T): Upsert<T> {
  return {
    where: { id: entity.id },
    create: entity,
    update: entity,
  };
}

interface Upsert<T> {
  where: { id: any };
  create: T;
  update: T;
}
