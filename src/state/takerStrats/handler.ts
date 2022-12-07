import * as mangroveSchema from "@proximaone/stream-schema-mangrove";
import { DbOperations } from "../dbOperations";

import {
  AccountId,
  ChainId,
  MangroveId,
  OfferId,
  OfferListId,
  OrderSummaryId,
  StratId,
  TokenId,
  TransactionId,
} from "../model";
import BigNumber from "bignumber.js";
import {
  PrismaStreamEventHandler,
  PrismaTransaction,
  TypedEvent,
} from "../../common";
import { createPatternMatcher } from "../../utils/discriminatedUnion";

export class IOrderLogicEventHandler extends PrismaStreamEventHandler<mangroveSchema.strategyEvents.TakerStrategyEvent> {
  protected async handleParsedEvents(
    events: TypedEvent<mangroveSchema.strategyEvents.TakerStrategyEvent>[],
    tx: PrismaTransaction
  ): Promise<void> {
    const db = new DbOperations(tx);
    for (const event of events) {
      const { payload, undo, timestamp } = event;
      const chainId = new ChainId(payload.chainId);

      const txRef = payload.tx;
      const txId = new TransactionId(chainId, txRef.txHash);
      const transaction = await db.ensureTransaction(
        txId,
        txRef.txHash,
        txRef.sender,
        timestamp,
        txRef.blockNumber,
        txRef.blockHash
      );

      await eventMatcher({
        OrderSummary: async (e) => {
          const offerList = {
            outboundToken: e.selling ? e.base : e.quote,
            inboundToken: e.selling ? e.quote : e.base,
          };
          await db.assertTokenExists(
            new TokenId(chainId, offerList.outboundToken)
          );
          await db.assertTokenExists(
            new TokenId(chainId, offerList.inboundToken)
          );
          const mangroveId = new MangroveId(chainId, e.mangroveId);
          const offerListId = new OfferListId(mangroveId, offerList);
          const orderSummaryId = new OrderSummaryId(
            mangroveId,
            offerList,
            e.id
          );

          if (undo) {
            await db.deleteOrderSummary(orderSummaryId);
            return;
          }
          const stratId = new StratId(chainId, e.address);
          const takerAccountId = new AccountId(chainId, e.taker);
          const restingOrderId = new OfferId(
            mangroveId,
            offerListId.offerListKey,
            e.restingOrderId
          );

          let outboundToken, inboundToken;
          try {
            const tokens = await db.getOfferListTokens(offerListId);
            outboundToken = tokens.outboundToken;
            inboundToken = tokens.inboundToken;
          } catch (e) {
            console.log(
              `failed to get offer list tokens - tx=${txRef.txHash}`,
              event
            );
            throw e;
          }
          const takerGotBigNumber = new BigNumber(e.takerGot).shiftedBy(
            -outboundToken.decimals
          );
          const takerGaveBigNumber = new BigNumber(e.takerGave).shiftedBy(
            -inboundToken.decimals
          );
          const penaltyBigNumber = new BigNumber(e.penalty).shiftedBy(-18); // TODO: The number of decimals for the native currency might be chain dependent

          await db.createOrderSummary({
            id: orderSummaryId.value,
            txId: transaction.id,
            mangroveId: mangroveId.value,
            stratId: stratId.value,
            offerListId: offerListId.value,
            takerId: takerAccountId.value,
            selling: e.selling,
            takerGot: e.takerGot,
            takerGotNumber: takerGotBigNumber.toNumber(),
            takerGave: e.takerGave,
            takerGaveNumber: takerGaveBigNumber.toNumber(),
            price: takerGaveBigNumber.div(takerGotBigNumber).toNumber(),
            penalty: e.penalty,
            penaltyNumber: penaltyBigNumber.toNumber(),
            restingOrderId: restingOrderId.value,
          });
        },
      })(payload);
    }
  }

  protected deserialize(
    payload: Buffer
  ): mangroveSchema.strategyEvents.TakerStrategyEvent {
    return mangroveSchema.streams.takerStrategies.serdes.deserialize(payload);
  }
}

const eventMatcher =
  createPatternMatcher<mangroveSchema.strategyEvents.TakerStrategyEvent>();
