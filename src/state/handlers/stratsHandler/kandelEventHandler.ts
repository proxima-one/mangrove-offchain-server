import { PrismaClient } from "@prisma/client";
import {
  PrismaStreamEventHandler,
  PrismaTransaction,
  TypedEvent,
} from "src/common";
import { allDbOperations } from "src/state/dbOperations/allDbOperations";
import {
  ChainId,
  KandelId,
  TransactionId
} from "src/state/model";
// import { KandelEvent } from "src/temp/kandelEvents";
import {KandelEvent, SeederEvent} from "@proximaone/stream-schema-mangrove/dist/kandel"
import { createPatternMatcher } from "src/utils/discriminatedUnion";
import { KandelEventsLogic } from "./kandelEventsLogic";

export class IKandelLogicEventHandler extends PrismaStreamEventHandler<KandelEvent | SeederEvent> {
  public constructor(
    prisma: PrismaClient,
    stream: string,
    private readonly chainId: ChainId
  ) {
    super(prisma, stream);
  }

  

  protected async handleParsedEvents(
    events: TypedEvent<KandelEvent | SeederEvent>[],
    tx: PrismaTransaction
  ): Promise<void> {
    const allDbOperation = allDbOperations(tx);
    const kandelEventsLogic = new KandelEventsLogic(allDbOperation);
    for (const event of events) {
      const { payload, undo, timestamp } = event;
      const chainId = new ChainId(payload.chainId);
      
      const txRef = payload.tx;
      const txId = new TransactionId(chainId, txRef.txHash);

      const transaction = await allDbOperation.transactionOperations.ensureTransaction({
        id: txId,
        txHash: txRef.txHash,
        from:  txRef.sender,
        timestamp: timestamp,
        blockNumber: txRef.blockNumber,
        blockHash: txRef.blockHash
    });
      await eventMatcher({
        NewAaveKandel: async (e) => {
          // await kandelEventsLogic.handleKandelCreated(undo, chainId, e, transaction)
        },
        NewKandel: async (e) => {
          // await kandelEventsLogic.handleKandelCreated(undo, chainId, e, transaction)
        },
        SetParams: async (e) => {
          await kandelEventsLogic.handleKandelParamsUpdated(undo, new KandelId(chainId, payload.address), e, transaction);
        },
        Debit: async (e) => {
          await kandelEventsLogic.handleDepositWithdrawal(undo, new KandelId(chainId, payload.address), e, transaction)
        },
        Credit: async (e) => {
          await kandelEventsLogic.handleDepositWithdrawal(undo, new KandelId(chainId, payload.address), e, transaction)
        },
        AllAsks: async (e) => {},
        AllBids: async (e) => {}
        // Populate: async (e) => {
        //   await kandelEventsLogic.handlePopulate(undo, new KandelId(chainId, payload.address), e, transaction);
        // },
        // RetractOffers: async (e) => {
        //   await kandelEventsLogic.handelRetractOffers(undo, new KandelId(chainId, payload.address), e, transaction);
        // },
        // OfferIndex: async (e) => {
        //   await kandelEventsLogic.handleOfferIndex(undo, new KandelId(chainId, payload.address), e, transaction);
        // }
      })(payload);
    }
  }

  // protected deserialize( //TODO: when proxima comes with stream
  //   payload: Buffer
  // ): KandelEvent {
  //   return mangroveSchema.streams.kandels.serdes.deserialize(payload);
  // }
}

const eventMatcher =
  createPatternMatcher<KandelEvent | SeederEvent>();
