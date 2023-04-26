import { PrismaClient } from "@prisma/client";
import {
  PrismaStreamEventHandler,
  PrismaTransaction,
  TypedEvent,
} from "src/utils/common";
import { allDbOperations } from "src/state/dbOperations/allDbOperations";
import {
  ChainId,
  KandelId,
  TransactionId
} from "src/state/model";
import { KandelEvent } from "src/temp/kandelEvents";
// import {KandelEvent, SeederEvent} from "@proximaone/stream-schema-mangrove/dist/kandel"
import { createPatternMatcher } from "src/utils/discriminatedUnion";
import { KandelEventsLogic } from "./kandelEventsLogic";

export class IKandelLogicEventHandler extends PrismaStreamEventHandler<KandelEvent > {
  public constructor(
    prisma: PrismaClient,
    stream: string,
    private readonly chainId: ChainId
  ) {
    super(prisma, stream);
  }

  protected async handleParsedEvents(
    events: TypedEvent<KandelEvent >[],
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
        NewKandel: async (e) => {
          await kandelEventsLogic.handleKandelCreated(undo, chainId, e, transaction)
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
        Populate: async (e) => {
          await kandelEventsLogic.handlePopulate(undo, new KandelId(chainId, payload.address), e, transaction);
        },
        Retract: async (e) => {
          await kandelEventsLogic.handelRetractOffers(undo, new KandelId(chainId, payload.address), e, transaction);
        },
        SetIndexMapping: async (e) => {
          await kandelEventsLogic.handleOfferIndex(undo, new KandelId(chainId, payload.address), e, transaction);
        },
        SetAdmin: async (e) => {
          await kandelEventsLogic.handleSetAdmin(undo, new KandelId(chainId, payload.address), e, transaction);
        },
        SetRouter: async (e) => {
          await kandelEventsLogic.handelSetRouter(undo, new KandelId(chainId, payload.address), e, transaction);
        },
      })(payload);
    }
  }
//TODO: when proxima comes with stream
  // protected deserialize( 
  //   payload: Buffer
  // ): KandelEvent {
  //   return mangroveSchema.streams.kandels.serdes.deserialize(payload);
  // }
}

const eventMatcher =
  createPatternMatcher<KandelEvent >();
