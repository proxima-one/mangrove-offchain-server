import { PrismaClient } from "@prisma/client";
import {
  ProximaStreamClient,
  BufferedStreamReader,
} from "@proximaone/stream-client-js";
import { Subscription } from "rxjs";
import retry from "async-retry";
import { StreamEventHandler } from "src/common";
import {
  MangroveEventHandler,
  TokenEventHandler,
  IOrderLogicEventHandler as TakerStratEventHandler,
} from "src/state";
import { ChainId } from "src/state/model";
import { defaultConfig } from "./config";

const retries = parseInt(process.env["CONSUMER_RETRIES"] ?? "100");
const retryFactor = parseFloat(process.env["CONSUMER_RETRY_FACTOR"] ?? "1.2");
const batchSize = parseInt(process.env["BATCH_SIZE"] ?? "50");

const prisma = new PrismaClient();
const streamClient = new ProximaStreamClient();
const timeout = 10 * 60 * 1000;

let stopped = false;
let subscription: Subscription;

async function main() {
  // todo: read config from file or env var, etc
  const config = defaultConfig;
  const streamEventHandlers: StreamEventHandler[] = [];

  for (const [chain, streamSchemas] of Object.entries(config.chains)) {
    console.log(`consuming chain ${chain} using following steams`, streamSchemas);

    const chainId = new ChainId(parseInt(chain));
    streamEventHandlers.push(
      ...(streamSchemas.mangrove ?? []).map(
        (s) => new MangroveEventHandler(prisma, s, chainId)
      )
    );
    streamEventHandlers.push(
      ...(streamSchemas.tokens ?? []).map(
        (s) => new TokenEventHandler(prisma, s, chainId)
      )
    );
    streamEventHandlers.push(
      ...(streamSchemas.strats ?? []).map(
        (s) => new TakerStratEventHandler(prisma, s, chainId)
      )
    );
  }

  await Promise.all(
    streamEventHandlers.map((handler) => retry(() => consumeStream(handler)), {
      retries: retries,
      factor: retryFactor,
    })
  );
}

async function consumeStream(handler: StreamEventHandler) {
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
