import * as prisma from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { Offset, StreamEvent, Timestamp } from "@proximaone/stream-client-js";
import { StreamEventHandler } from "./stateTransitionHandler";

export class PrismaStreamEventHandler<TEventPayload>
  implements StreamEventHandler
{
  public constructor(
    protected readonly prisma: PrismaClient,
    protected readonly stream: string
  ) {}

  public getStreamName(): string {
    return this.stream;
  }

  public async getCurrentStreamOffset(): Promise<Offset> {
    const streamConsumer = await this.prisma.streams.findFirst({
      where: { id: this.stream },
    });

    const offset = streamConsumer?.offset
      ? Offset.fromString(streamConsumer.offset)
      : Offset.zero;
    return offset;
  }

  public async handleEvents(events: StreamEvent[]): Promise<void> {
    if (events.length == 0) return;

    await this.prisma.$transaction(
      async (tx) => {
        await this.handleParsedEvents(
          events.map((event) => {
            return {
              undo: event.undo,
              timestamp: event.timestamp,
              payload: this.deserialize(Buffer.from(event.payload)),
            };
          }),
          tx
        );

        const offset = events[events.length - 1].offset;
        await tx.streams.upsert({
          where: { id: this.stream },
          create: { id: this.stream, offset: offset.toString() },
          update: { offset: offset.toString() },
        });
      },
      { timeout: 5 * 60 * 1000, maxWait: 1 * 60 * 1000 }
    );
  }

  protected deserialize(payload: Buffer): TEventPayload {
    throw new Error("not implemented");
  }

  protected async handleParsedEvents(
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
