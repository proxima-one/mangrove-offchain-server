import * as prisma from "@prisma/client";
import * as _ from "lodash";
import * as mangroveSchema from "@proximaone/stream-schema-mangrove";

import {
  AccountId,
  ChainId,
  MakerBalanceId,
  OfferId,
  OfferListId,
  OfferVersionId,
  OrderId,
  TakenOfferId,
  TakerApprovalId,
  TokenId,
} from "../model";
import { strict as assert } from "assert";
import BigNumber from "bignumber.js";
import { Mangrove, OfferVersion } from "@prisma/client";
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
            await db.deleteMangrove(e.id);
            return;
          }

          const chainId = new ChainId(e.chain.chainlistId);
          await db.ensureChain(chainId, e.chain.name);
          await db.ensureMangrove(e.id, chainId, e.address);
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
          const accountPromise = db.ensureAccount(accountId);

          const offerListId = new OfferListId(mangroveId, offerList);
          const offerListTokensPromise = db.getOfferListTokens(offerListId);

          const prevOfferId =
            offer.prev == 0
              ? null
              : new OfferId(mangroveId, offerList, offer.prev);

          const { outboundToken, inboundToken } = await offerListTokensPromise;
          const givesBigNumber = new BigNumber(offer.gives).shiftedBy(
            -outboundToken.decimals
          );
          const wantsBigNumber = new BigNumber(offer.wants).shiftedBy(
            -inboundToken.decimals
          );

          await accountPromise;

          const offerInDb = await db.getOffer(offerId);

          await db.addVersionedOffer(
            offerId,
            offerInDb?.currentVersionId,
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
          if (undo) {
            // TODO: Handle undo
            // Do not not continue on unhandled undo as the state of the DB might be broken
            this.#reportUnhandledUndoAndExit(event);
          }
          const mangrove = await db.getMangrove(mangroveId);
          const chainId = new ChainId(mangrove!.chainId);
          const inboundTokenId = new TokenId(chainId, offerList.inboundToken);
          await db.assertTokenExists(inboundTokenId);
          const outboundTokenId = new TokenId(chainId, offerList.outboundToken);
          await db.assertTokenExists(outboundTokenId);

          const id = new OfferListId(mangroveId, offerList);
          await db.updateOfferList(id, (model) => {
            _.merge(model, params);
          });
        },
        MangroveParamsUpdated: async ({ params }) => {
          if (undo) {
            // TODO: Handle undo
            // Do not not continue on unhandled undo as the state of the DB might be broken
            this.#reportUnhandledUndoAndExit(event);
          }
          await db.updateMangrove(mangroveId, (model) => {
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
    offerId: OfferId,
    oldOfferVersionId: string | undefined,
    offer: Omit<prisma.Offer, "deleted" | "currentVersionId">,
    offerVersion: Omit<
      prisma.OfferVersion,
      "id" | "offerId" | "versionNumber" | "prevVersionId"
    >
  ) {
    let oldOfferVersion: prisma.OfferVersion | null = null;
    if (oldOfferVersionId !== undefined) {
      oldOfferVersion = await this.tx.offerVersion.findUnique({
        where: { id: oldOfferVersionId },
      });
      if (oldOfferVersion === null)
        throw new Error(`Old OfferVersion not found, id: ${oldOfferVersion}`);
    }

    const newOfferVersionNumber =
      oldOfferVersion === null ? 0 : oldOfferVersion.versionNumber + 1;
    const newOfferVersionId = new OfferVersionId(
      offerId,
      newOfferVersionNumber
    );

    await this.tx.offer.upsert(
      toUpsert({
        ...offer,
        currentVersionId: newOfferVersionId.value,
        deleted: false,
      })
    );

    await this.tx.offerVersion.create({
      data: {
        ...offerVersion,
        id: newOfferVersionId.value,
        offerId: offer.id,
        versionNumber: newOfferVersionNumber,
        prevVersionId: oldOfferVersionId,
      },
    });
  }

  public async deleteLatestOfferVersion(id: OfferId) {
    const offer = await this.tx.offer.findUnique({ where: { id: id.value } });
    if (offer === null) throw Error(`Offer not found - id: ${id.value}`);

    const offerVersion = await this.tx.offerVersion.findUnique({
      where: { id: offer.currentVersionId },
    });
    await this.tx.offerVersion.delete({
      where: { id: offer.currentVersionId },
    });

    if (offerVersion!.prevVersionId === null) {
      await this.tx.offer.delete({ where: { id: id.value } });
    } else {
      offer.currentVersionId = offerVersion!.prevVersionId;
      await this.tx.offer.update({ where: { id: id.value }, data: offer });
    }
  }

  public async updateOfferList(
    id: OfferListId,
    updateFunc: (model: prisma.OfferList) => void
  ) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id.mangroveId },
    });
    const chainId = new ChainId(mangrove!.chainId);
    const inboundTokenId = new TokenId(chainId, id.offerListKey.inboundToken);
    const outboundTokenId = new TokenId(chainId, id.offerListKey.outboundToken);
    const offerList = (await this.tx.offerList.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      inboundTokenId: inboundTokenId.value,
      outboundTokenId: outboundTokenId.value,
      active: null,
      density: null,
      gasbase: null,
      fee: null,
    };

    updateFunc(offerList);

    await this.tx.offerList.upsert(toUpsert(offerList));
    return offerList;
  }

  public async deleteOrder(id: OrderId) {
    await this.tx.order.deleteMany({ where: { id: id.value } });
  }

  public async ensureMangrove(id: string, chainId: ChainId, address: string) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id },
    });

    if (!mangrove) {
      await this.tx.mangrove.create({
        data: {
          id: id,
          chainId: chainId.value,
          address: address,
          gasprice: null,
          gasmax: null,
          dead: null,
          monitor: null,
          notify: null,
          useOracle: null,
          vault: null,
        },
      });
    }
  }

  public async getMangrove(id: string): Promise<Mangrove | null> {
    return this.tx.mangrove.findUnique({
      where: { id: id },
    });
  }

  public async updateMangrove(
    id: string,
    updateFunc: (model: prisma.Mangrove) => void
  ) {
    const mangrove = await this.tx.mangrove.findUnique({
      where: { id: id },
    });

    assert(mangrove);
    updateFunc(mangrove);

    await this.tx.mangrove.upsert(toUpsert(mangrove));
    return mangrove;
  }

  public async deleteMangrove(id: string) {
    await this.tx.mangrove.deleteMany({ where: { id: id } });
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
