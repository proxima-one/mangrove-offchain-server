import { StateTransitionHandler } from "./stateTransitionHandler";
import { PrismaClient } from "@prisma/client";
import {
  State,
  StreamStateRef,
  Timestamp,
  Transition,
} from "@proximaone/stream-client-js";
import * as prisma from "@prisma/client";

export class PrismaStateTransitionHandler<TEventPayload>
  implements StateTransitionHandler
{
  public constructor(
    protected readonly prisma: PrismaClient,
    protected readonly stream: string
  ) {}

  public async getCurrentStreamState(): Promise<StreamStateRef> {
    const streamConsumer = await this.prisma.streams.findFirst({
      where: { id: this.stream },
    });

    const state = streamConsumer?.state
      ? new State(streamConsumer?.state)
      : State.genesis;
    return new StreamStateRef(this.stream, state);
  }

  public async handleTransitions(transitions: Transition[]): Promise<void> {
    if (transitions.length == 0) return;

    await this.prisma.$transaction(async (tx) => {
      await this.handleEvents(
        transitions.map((x) => {
          return {
            undo: x.event.undo,
            timestamp: x.event.timestamp,
            payload: this.deserialize(x.event.payload),
          };
        }),
        tx
      );

      const state = transitions[transitions.length - 1].newState;
      await tx.streams.upsert({
        where: { id: this.stream },
        create: { id: this.stream, state: state.id },
        update: { state: state.id },
      });
    }, {timeout: 2 * 60 * 1000, maxWait: 1 * 60 * 1000});
  }

  protected deserialize(payload: Buffer): TEventPayload {
    throw new Error("not implemented");
  }

  protected async handleEvents(
    events: TypedEvent<TEventPayload>[],
    tx: PrismaTransaction
  ): Promise<void> {
    throw new Error("not implemented");
  }
}

export type TypedEvent<T> = Readonly<{
  undo: boolean;
  timestamp: Timestamp;
  payload: T;
}>;

export type PrismaTransaction = Omit<
  prisma.PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;
