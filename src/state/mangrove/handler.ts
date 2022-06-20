import * as prisma from "@prisma/client";
import * as _ from "lodash";
import * as mangroveSchema from "@proximaone/stream-schema-mangrove";

import {
  AccountId,
  ChainId,
  MakerBalanceId,
  MangroveId,
  OfferId,
  OfferListId,
  OrderId,
  TakenOfferId,
  TakerApprovalId,
  TokenId,
  TransactionId,
} from "../model";
import { DbOperations } from "../dbOperations";
import { strict as assert } from "assert";
import BigNumber from "bignumber.js";
import {
  PrismaStateTransitionHandler,
  PrismaTransaction,
  TypedEvent,
} from "../../common";
import { createPatternMatcher } from "../../utils/discriminatedUnion";

export class MangroveEventHandler extends PrismaStateTransitionHandler<mangroveSchema.events.MangroveEvent> {
  protected async handleEvents(
    events: TypedEvent<mangroveSchema.events.MangroveEvent>[],
    tx: PrismaTransaction
  ): Promise<void> {
    const db = new DbOperations(tx);
    for (const event of events) {
      const { payload, undo, timestamp } = event;
      const chainId: ChainId = new ChainId(payload.chainId);
      const mangroveId = new MangroveId(chainId, payload.mangroveId!);
      const parentOrderId =
        payload.parentOrder === undefined
          ? undefined
          : new OrderId(
              mangroveId,
              payload.parentOrder.offerList,
              payload.parentOrder.id
            );
      const txRef = payload.tx;

      let transaction: prisma.Transaction | undefined;
      if (txRef !== undefined) {
        const txId = new TransactionId(chainId, txRef.txHash);
        transaction = await db.ensureTransaction(
          txId,
          txRef.txHash,
          txRef.sender,
          timestamp,
          txRef.blockNumber,
          txRef.blockHash
        );
      }

      await eventMatcher({
        MangroveCreated: async (e) => {
          if (undo) {
            await db.deleteLatestMangroveVersion(mangroveId);
            return;
          }

          await db.createMangrove(mangroveId, chainId, e.address, transaction!);
        },
        MangroveParamsUpdated: async ({ params }) => {
          if (undo) {
            await db.deleteLatestMangroveVersion(mangroveId);
            return;
          }

          await db.addVersionedMangrove(
            mangroveId,
            (model) => {
              _.merge(model, params);
            },
            transaction
          );
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

          const accountId = new AccountId(chainId, maker);
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
              mangroveId: mangroveId.value,
              offerListId: offerListId.value,
              makerId: maker,
            },
            {
              txId: transaction!.id,
              parentOrderId: parentOrderId?.value ?? null,
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
          const inboundTokenId = new TokenId(chainId, offerList.inboundToken);
          await db.assertTokenExists(inboundTokenId);
          const outboundTokenId = new TokenId(chainId, offerList.outboundToken);
          await db.assertTokenExists(outboundTokenId);
          const id = new OfferListId(mangroveId, offerList);

          if (undo) {
            await db.deleteLatestOfferListVersion(id);
            return;
          }

          await db.addVersionedOfferList(id, transaction!, (model) => {
            _.merge(model, params);
          });
        },
        MakerBalanceUpdated: async ({ maker, amountChange }) => {
          const id = new MakerBalanceId(mangroveId, maker);

          if (undo) {
            await db.deleteLatestMakerBalanceVersion(id);
            return;
          }

          // TODO: Add parentOrderId when sufficient information is available

          const amount = new BigNumber(amountChange);

          await db.addVersionedMakerBalance(id, transaction!, (model) => {
            model.balance = new BigNumber(model.balance).plus(amount).toFixed();
          });
        },
        TakerApprovalUpdated: async ({ offerList, amount, spender, owner }) => {
          const id = new TakerApprovalId(mangroveId, offerList, owner, spender);

          if (undo) {
            await db.deleteLatestTakerApprovalVersion(id);
            return;
          }

          const accountId = new AccountId(chainId, owner);
          await db.ensureAccount(accountId);

          await db.addVersionedTakerApproval(
            id,
            transaction!,
            (model) => {
              model.value = amount;
            },
            parentOrderId
          );
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

          const takerAccountId = new AccountId(chainId, order.taker);
          await db.ensureAccount(takerAccountId);
          await tx.order.create({
            data: {
              id: orderId.value,
              txId: transaction!.id,
              parentOrderId: parentOrderId?.value ?? null,
              offerListId: offerListId.value,
              mangroveId: mangroveId.value,
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

  protected deserialize(payload: Buffer): mangroveSchema.events.MangroveEvent {
    return mangroveSchema.streams.mangrove.serdes.deserialize(payload);
  }
}

const eventMatcher =
  createPatternMatcher<mangroveSchema.events.MangroveEvent>();
