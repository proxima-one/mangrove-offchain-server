import * as mangroveSchema from "@proximaone/stream-schema-mangrove";
import { DbOperations } from "../dbOperations";

import {
  AccountId,
  ChainId,
  OfferId,
  OfferListId,
  TransactionId,
} from "../model";
import BigNumber from "bignumber.js";
import {
  PrismaStreamEventHandler,
  PrismaTransaction,
  TypedEvent,
} from "../../common";
import { createPatternMatcher } from "../../utils/discriminatedUnion";

export class MultiUserStratEventHandler extends PrismaStreamEventHandler<mangroveSchema.strategyEvents.MultiUserStrategyEvent> {
  protected async handleParsedEvents(
    events: TypedEvent<mangroveSchema.strategyEvents.MultiUserStrategyEvent>[],
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
        CreditMgvUser: async (e) => {
          if (undo) {
            // TODO: Implement undo
            return;
          }
          // TODO: Implement
        },
        CreditUserTokenBalance: async (e) => {
          if (undo) {
            // TODO: Implement undo
            return;
          }
          // TODO: Implement
        },
        DebitMgvUser: async (e) => {
          if (undo) {
            // TODO: Implement undo
            return;
          }
          // TODO: Implement
        },
        DebitUserTokenBalance: async (e) => {
          if (undo) {
            // TODO: Implement undo
            return;
          }
          // TODO: Implement
        },
        NewOwnedOffer: async (e) => {
          if (undo) {
            // TODO: Implement undo
            return;
          }
          // TODO: Implement
        },
      })(payload);
    }
  }

  protected deserialize(
    payload: Buffer
  ): mangroveSchema.strategyEvents.MultiUserStrategyEvent {
    return mangroveSchema.streams.multiUserStrategies.serdes.deserialize(
      payload
    );
  }
}

const eventMatcher =
  createPatternMatcher<mangroveSchema.strategyEvents.MultiUserStrategyEvent>();
