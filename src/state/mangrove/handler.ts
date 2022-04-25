import * as prisma from "@prisma/client";
import * as _ from "lodash";
import * as mangroveSchema from "@proximaone/stream-schema-mangrove";

import {
  AccountId,
  ChainId,
  MakerBalanceId,
  MangroveVersionId,
  OfferId,
  OfferListId,
  OfferListVersionId,
  OfferVersionId,
  OrderId,
  TakenOfferId,
  TakerApprovalId,
  TokenId,
} from "../model";
import { strict as assert } from "assert";
import BigNumber from "bignumber.js";
import { Mangrove, OfferList } from "@prisma/client";
import {
  PrismaStateTransitionHandler,
  PrismaTransaction,
  TypedEvent,
} from "../../common";
import { createPatternMatcher } from "../../utils/discriminatedUnion";

export class MangroveEventHandler extends PrismaStateTransitionHandler<mangroveSchema.streams.MangroveStreamEvent> {
  protected async handleEvents(
    events: TypedEvent<mangroveSchema.streams.MangroveStreamEvent>[],
    tx: PrismaTransaction
  ): Promise<void> {
    const db = new DbOperations(tx);
    for (const event of events) {
      const { payload, undo, timestamp } = event;
      const mangroveId = payload.mangroveId!;
      const txRef = payload.tx;

      await eventMatcher({
        MangroveCreated: async (e) => {
          if (undo) {
            await db.deleteLatestMangroveVersion(mangroveId);
            return;
          }

          const chainId = new ChainId(e.chain.chainlistId);
          await db.ensureChain(chainId, e.chain.name);
          await db.createMangrove(e.id, chainId, e.address);
        },
        MangroveParamsUpdated: async ({ params }) => {
          if (undo) {
            await db.deleteLatestMangroveVersion(mangroveId);
            return;
          }

          await db.addVersionedMangrove(mangroveId, (model) => {
            _.merge(model, params);
          });
        },
        OfferRetracted: async (e) => {
          const offerId = new OfferId(mangroveId, e.offerList, e.offerId);
          if (undo) {
            await db.markOfferAsUndeleted(offerId);
            return;
          }
          await db.markOfferAsDeleted(offerId);
        },
        OfferWritten: async ({ offer, maker, offerList }) => {
          assert(txRef);
          const offerId = new OfferId(mangroveId, offerList, offer.id);

          if (undo) {
            await db.deleteLatestOfferVersion(offerId);
            return;
          }

          const accountId = new AccountId(maker);
          await db.ensureAccount(accountId);

          const offerListId = new OfferListId(mangroveId, offerList);

          const prevOfferId =
            offer.prev == 0
              ? null
              : new OfferId(mangroveId, offerList, offer.prev);

          const { outboundToken, inboundToken } = await db.getOfferListTokens(
            offerListId
          );
          const givesBigNumber = new BigNumber(offer.gives).shiftedBy(
            -outboundToken.decimals
          );
          const wantsBigNumber = new BigNumber(offer.wants).shiftedBy(
            -inboundToken.decimals
          );

          await db.addVersionedOffer(
            offerId,
            {
              id: offerId.value,
              mangroveId: mangroveId,
              offerListId: offerListId.value,
              makerId: maker,
            },
            {
              blockNumber: txRef.blockNumber,
              time: timestamp.date,
              gasprice: offer.gasprice,
              gives: offer.gives,
              givesNumber: givesBigNumber.toNumber(),
              wants: offer.wants,
              wantsNumber: wantsBigNumber.toNumber(),
              takerPaysPrice: givesBigNumber.gt(0)
                ? wantsBigNumber.div(givesBigNumber).toNumber()
                : null,
              makerPaysPrice: wantsBigNumber.gt(0)
                ? givesBigNumber.div(wantsBigNumber).toNumber()
                : null,
              gasreq: offer.gasreq,
              live: new BigNumber(offer.gives).isPositive(),
              deprovisioned: offer.gasprice == 0,
              prevOfferId: prevOfferId ? prevOfferId.value : null,
            }
          );
        },
        OfferListParamsUpdated: async ({ offerList, params }) => {
          const mangrove = await db.getMangrove(mangroveId);
          const chainId = new ChainId(mangrove!.chainId);
          const inboundTokenId = new TokenId(chainId, offerList.inboundToken);
          await db.assertTokenExists(inboundTokenId);
          const outboundTokenId = new TokenId(chainId, offerList.outboundToken);
          await db.assertTokenExists(outboundTokenId);
          const id = new OfferListId(mangroveId, offerList);

          if (undo) {
            await db.deleteLatestOfferListVersion(id);
            return;
          }

          await db.addVersionedOfferList(id, (model) => {
            _.merge(model, params);
          });
        },
        MakerBalanceUpdated: async ({ maker, amountChange }) => {
          let amount = new BigNumber(amountChange);
          if (undo) amount = amount.times(-1);

          const makerBalanceId = new MakerBalanceId(mangroveId, maker);

          await db.updateMakerBalance(makerBalanceId, (model) => {
            model.balance = new BigNumber(model.balance).plus(amount).toFixed();
          });
        },
        TakerApprovalUpdated: async ({ offerList, amount, spender, owner }) => {
          if (undo) {
            // TODO: Handle undo
            // Do not not continue on unhandled undo as the state of the DB might be broken
            this.#reportUnhandledUndoAndExit(event);
          }
          const takerApprovalId = new TakerApprovalId(
            mangroveId,
            offerList,
            owner,
            spender
          );
          const accountId = new AccountId(owner);

          await db.ensureAccount(accountId);
          await db.updateTakerApproval(takerApprovalId, (model) => {
            model.value = amount;
          });
        },
        OrderCompleted: async ({ id, order, offerList }) => {
          assert(txRef);
          const orderId = new OrderId(mangroveId, offerList, id);

          if (undo) {
            await db.deleteOrder(orderId);
            for (const takenOffer of order.takenOffers) {
              await db.markOfferAsUndeleted(
                new OfferId(mangroveId, offerList, takenOffer.id)
              );
            }
            return;
          }

          const offerListId = new OfferListId(mangroveId, offerList);

          const { outboundToken, inboundToken } = await db.getOfferListTokens(
            offerListId
          );
          const takerGotBigNumber = new BigNumber(order.takerGot).shiftedBy(
            -outboundToken.decimals
          );
          const takerGaveBigNumber = new BigNumber(order.takerGave).shiftedBy(
            -inboundToken.decimals
          );

          // Taken offers have been removed from the book. Any offers that are reposted
          // will result in `OfferWritten` events that will be sent _after_ the
          // `OrderCompleted` event. We therefore remove all taken offers here.
          for (const takenOffer of order.takenOffers) {
            await db.markOfferAsDeleted(
              new OfferId(mangroveId, offerList, takenOffer.id)
            );
          }

          // create order and taken offers
          // taken offer is not an aggregate

          const takerAccountId = new AccountId(order.taker);
          await db.ensureAccount(takerAccountId);
          await tx.order.create({
            data: {
              id: orderId.value,
              time: timestamp.date,
              blockNumber: txRef.blockNumber,
              offerListId: offerListId.value,
              mangroveId: mangroveId,
              takerId: takerAccountId.value,
              takerGot: order.takerGot,
              takerGotNumber: takerGotBigNumber.toNumber(),
              takerGave: order.takerGave,
              takerGaveNumber: takerGaveBigNumber.toNumber(),
              takerPaidPrice: takerGotBigNumber.gt(0)
                ? takerGaveBigNumber.div(takerGotBigNumber).toNumber()
                : undefined,
              makerPaidPrice: takerGaveBigNumber.gt(0)
                ? takerGotBigNumber.div(takerGaveBigNumber).toNumber()
                : undefined,
              penalty: order.penalty,
              takenOffers: {
                create: order.takenOffers.map((o) => {
                  const takerWantsBigNumber = new BigNumber(
                    o.takerWants
                  ).shiftedBy(-outboundToken.decimals);
                  const takerGivesBigNumber = new BigNumber(
                    o.takerGives
                  ).shiftedBy(-inboundToken.decimals);
                  return {
                    id: new TakenOfferId(orderId, o.id).value,
                    takerWants: o.takerWants,
                    takerWantsNumber: takerWantsBigNumber.toNumber(),
                    takerGives: o.takerGives,
                    takerGivesNumber: takerGivesBigNumber.toNumber(),
                    takerPaysPrice: takerWantsBigNumber.gt(0)
                      ? takerGivesBigNumber.div(takerWantsBigNumber).toNumber()
                      : undefined,
                    makerPaysPrice: takerGivesBigNumber.gt(0)
                      ? takerWantsBigNumber.div(takerGivesBigNumber).toNumber()
                      : undefined,
                    failReason: o.failReason,
                    posthookFailed: o.posthookFailed == true,
                  };
                }),
              },
            },
          });
        },
      })(payload);
    }
  }

  protected deserialize(
    payload: Buffer
  ): mangroveSchema.streams.MangroveStreamEvent {
    return mangroveSchema.streams.mangrove.serdes.deserialize(payload);
  }

  #reportUnhandledUndoAndExit(
    event: TypedEvent<mangroveSchema.streams.MangroveStreamEvent>
  ) {
    console.error(
      `Undo unhandled for event ${event.payload.type} - exiting to avoid data corruption`
    );
    process.exit(1);
  }
}

export class DbOperations {
  public constructor(private readonly tx: PrismaTx) {}

  public async ensureAccount(id: AccountId): Promise<prisma.Account> {
    let account = await this.tx.account.findUnique({ where: { id: id.value } });
    if (account == undefined) {
      account = {
        id: id.value,
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
    updateFunc: (model: prisma.OfferListVersion) => void
  ) {
    let offerList: OfferList | null = await this.tx.offerList.findUnique({
      where: { id: id.value },
    });
    let newVersion: prisma.OfferListVersion;

    if (offerList === null) {
      const mangrove = await this.tx.mangrove.findUnique({
        where: { id: id.mangroveId },
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
        mangroveId: id.mangroveId,
        outboundTokenId: outboundTokenId.value,
        inboundTokenId: inboundTokenId.value,
        currentVersionId: newVersionId.value,
      };
      newVersion = {
        id: newVersionId.value,
        offerListId: id.value,
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

  public async createMangrove(id: string, chainId: ChainId, address: string) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id },
    });

    if (!mangrove) {
      const newVersionId = new MangroveVersionId(id, 0);
      await this.tx.mangrove.create({
        data: {
          id: id,
          chainId: chainId.value,
          address: address,
          currentVersionId: newVersionId.value,
        },
      });
      await this.tx.mangroveVersion.create({
        data: {
          id: newVersionId.value,
          mangroveId: id,
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

  public async getMangrove(id: string): Promise<Mangrove | null> {
    return this.tx.mangrove.findUnique({
      where: { id: id },
    });
  }

  // Add a new MangroveVersion to an existing Mangrove
  public async addVersionedMangrove(
    id: string,
    updateFunc: (model: prisma.MangroveVersion) => void
  ) {
    const mangrove: Mangrove | null = await this.tx.mangrove.findUnique({
      where: { id: id },
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

  public async deleteLatestMangroveVersion(id: string) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id },
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
      await this.tx.mangrove.delete({ where: { id: id } });
    } else {
      mangrove.currentVersionId = mangroveVersion!.prevVersionId;
      await this.tx.mangrove.update({
        where: { id: id },
        data: mangrove,
      });
    }
  }

  public async updateMakerBalance(
    id: MakerBalanceId,
    updateFunc: (model: prisma.MakerBalance) => void
  ) {
    const makerBalance = (await this.tx.makerBalance.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      balance: "0",
      makerId: new AccountId(id.address).value,
    };

    updateFunc(makerBalance);

    await this.tx.makerBalance.upsert(toUpsert(makerBalance));
  }

  public async updateTakerApproval(
    id: TakerApprovalId,
    updateFunc: (model: prisma.TakerApproval) => void
  ) {
    const takerApproval = (await this.tx.takerApproval.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      ownerId: new AccountId(id.ownerAddress).value,
      spenderId: new AccountId(id.spenderAddress).value,
      offerListId: new OfferListId(id.mangroveId, id.offerListKey).value,
      value: "0",
    };

    updateFunc(takerApproval);

    await this.tx.takerApproval.upsert(toUpsert(takerApproval));
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

const eventMatcher =
  createPatternMatcher<mangroveSchema.streams.MangroveStreamEvent>();
