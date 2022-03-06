import { PrismaClient } from "@prisma/client";
import { StreamClient } from "@proximaone/stream-client-js";
import { Subscription } from "rxjs";
import { DomainEvent, EventHandler, events } from "../eventHandler";
import { barrier } from "../utils/barrier";

const prisma = new PrismaClient();
const streamClient = new StreamClient("streams.proxima.one:443");

let stopped = false;
let subscription: Subscription;
const dbWriteBatchSize = parseInt(process.env["BATCH_SIZE"] ?? "50");

async function main() {
  const buffer: DomainEvent[] = [];
  let bufferWait = barrier(1);
  let stoppedConsuming = false;
  const domainEventStreamConsumer = new EventHandler(prisma, "domain-events");

  const streamState = await domainEventStreamConsumer.getStreamState();
  console.log(`Consuming stream from ${streamState ?? "the beginning"}`);

  const eventStream = streamClient.streamMessages(
    "domain-events.mangrove.streams.proxima.one",
    {
      latest: streamState,
    }
  );

  stoppedConsuming = false;

  subscription = eventStream.subscribe((msg) => {
    const payload = decodeJson(
      msg.payload
    ) as events.MangroveStreamEventPayload;

    buffer.push({
      payload,
      undo: msg.header?.undo == true,
      timestamp: new Date(msg.timestamp.seconds + msg.timestamp.nanos / 1e6),
      state: msg.id,
    });

    bufferWait.unlock();
  });

  await sink();

  async function sink() {
    while (!stopped) {
      if (buffer.length == 0) {
        if (stoppedConsuming)
          // buffer was too big, so process stopped
          break;
        await bufferWait.lock;
        bufferWait = barrier(1);
      }

      const toHandle = buffer.splice(0, dbWriteBatchSize);

      console.log(
        `handling ${toHandle.length} input events. remaining buffer: ${buffer.length}`
      );
      await domainEventStreamConsumer.handle(toHandle);
    }
  }
}

function isValidString(s: string): boolean {
  return !/.*[\x00\r\n].*/.test(s);
}

function decodeJson(binary: Uint8Array | string): any {
  const buffer =
    typeof binary == "string"
      ? Buffer.from(binary, "base64")
      : Buffer.from(binary);
  return JSON.parse(buffer.toString("utf8"));
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    stopped = true;
    if (subscription) subscription.unsubscribe();
    await prisma.$disconnect();
  });
