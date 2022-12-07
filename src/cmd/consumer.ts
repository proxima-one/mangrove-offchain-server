import { PrismaClient } from "@prisma/client";
import {
  ProximaStreamClient,
  Offset,
  BufferedStreamReader,
} from "@proximaone/stream-client-js";
import { Subscription } from "rxjs";
import retry from "async-retry";
import { StreamEventHandler } from "../common";
import {
  MangroveEventHandler,
  TokenEventHandler,
  IOrderLogicEventHandler as TakerStratEventHandler,
  MultiUserStratEventHandler,
} from "../state";

const retries = parseInt(process.env["CONSUMER_RETRIES"] ?? "100");
const retryFactor = parseFloat(process.env["CONSUMER_RETRY_FACTOR"] ?? "1.2");
const batchSize = parseInt(process.env["BATCH_SIZE"] ?? "50");

const prisma = new PrismaClient();
const streamClient = new ProximaStreamClient();
const timeout = 10 * 60 * 1000;

let stopped = false;
let subscription: Subscription;

async function main() {
  const streamConsumers = [
    () =>
      consumeStream(
        new MangroveEventHandler(
          prisma,
          "proxima.mangrove.polygon-mumbai.domain-events.0_1"
        )
      ),
    () =>
      consumeStream(
        new TakerStratEventHandler(
          prisma,
          "proxima.mangrove.polygon-mumbai.multi-user-strategies.0_1"
        )
      ),
    () =>
      consumeStream(
        new MultiUserStratEventHandler(
          prisma,
          "proxima.mangrove.polygon-mumbai.multi-user-strategies.0_1"
        )
      ),
    () =>
      consumeStream(
        new TokenEventHandler(
          prisma,
          "proxima.ft.polygon-mumbai.new-tokens.0_2"
        )
      ),
  ];

  await Promise.all(
    streamConsumers.map((consumerFunc) => retry(consumerFunc), {
      retries: retries,
      factor: retryFactor,
    })
  );
}

async function consumeStream<T>(handler: StreamEventHandler) {
  const currentOffset = await handler.getCurrentStreamOffset();
  const stream = handler.getStreamName();

  console.log(
    `consuming stream ${stream} from offset ${currentOffset.toString()}`
  );
  const pauseable = await streamClient.streamEvents(stream, currentOffset);
  const reader = BufferedStreamReader.fromStream(pauseable);

  while (!stopped) {
    const events = await reader.read(batchSize);
    if (events === undefined) {
      console.log(`Finished consuming stream ${stream}`);
      break;
    }

    try {
      await handler.handleEvents(events);
    } catch (err) {
      console.error("error handling events", err);
      throw err;
    }

    console.log(
      `handled ${stream}: ${events[events.length - 1].offset.toString()}`
    );
  }
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
