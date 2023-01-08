import { PrismaClient } from "@prisma/client";
import {
  BufferedStreamReader, Offset,
  ProximaStreamClient, StreamRegistryClient,
} from "@proximaone/stream-client-js";
import retry from "async-retry";
import { Subscription, takeWhile } from "rxjs";
import { StreamEventHandler } from "src/common";
import {
  MangroveEventHandler,
  IOrderLogicEventHandler as TakerStratEventHandler,
  TokenEventHandler,
} from "src/state";
import { ChainId } from "src/state/model";
import { ChainConfig } from "src/utils/config/ChainConfig";
import config from "src/utils/config/config";
import { getChainConfigsOrThrow } from "src/utils/config/configUtils";
import logger from "src/utils/logger";
import * as _ from "lodash";

const retries = parseInt(process.env["CONSUMER_RETRIES"] ?? "100");
const retryFactor = parseFloat(process.env["CONSUMER_RETRY_FACTOR"] ?? "1.2");
const batchSize = parseInt(process.env["BATCH_SIZE"] ?? "50");

const prisma = new PrismaClient();
const streamClient = new ProximaStreamClient();

let stopped = false;
let subscription: Subscription;

async function main() {
  const streamEventHandlers: StreamEventHandler[] = [];
  const preloads: {handler: StreamEventHandler, toHeight: bigint}[] = [];

  for (const chain of getChainConfigsOrThrow<ChainConfig>(config)) {
    logger.info(`consuming chain ${chain.id} using following streams ${JSON.stringify(chain.streams)}`);

    const chainId = new ChainId(parseInt( chain.id) );

    const tokenStreams = chain.streams.tokens ?? [];
    for (const tokenStream of tokenStreams) {
      const lastOffset = await getStreamLastOffset(tokenStream);
      if (lastOffset)
        preloads.push({handler: new TokenEventHandler(prisma, tokenStream, chainId), toHeight: lastOffset.height});

      streamEventHandlers.push(new TokenEventHandler(prisma, tokenStream, chainId));
    }

    const mangroveStreams = chain.streams.mangrove ?? [];
    for (const mangroveStream of mangroveStreams) {
      const lastOffset = await getStreamLastOffset(mangroveStream);
      if (lastOffset)
        preloads.push({handler: new MangroveEventHandler(prisma, mangroveStream, chainId), toHeight: lastOffset.height});

      streamEventHandlers.push(new MangroveEventHandler(prisma, mangroveStream, chainId));
    }

    streamEventHandlers.push(
      ...(chain.streams?.strats ?? []).map(
        (s) => new TakerStratEventHandler(prisma, s, chainId)
      )
    );
  }

  await Promise.all(
    preloads.map(({handler, toHeight}) => retry(() => consumeStream(handler, toHeight)), {
      retries: retries,
      factor: retryFactor,
    })
  );

  await Promise.all(
    streamEventHandlers.map((handler) => retry(() => consumeStream(handler)), {
      retries: retries,
      factor: retryFactor,
    })
  );
}

async function consumeStream(handler: StreamEventHandler, toHeight?: bigint) {
  const currentOffset = await handler.getCurrentStreamOffset();
  const stream = handler.getStreamName();

  logger.info(
    `consuming stream ${stream} from offset ${currentOffset.toString()} to ${toHeight}`
  );
  let eventStream = await streamClient.streamEvents(stream, currentOffset);

  if (toHeight != undefined) {
    if (currentOffset.height >= toHeight)
      return;

    eventStream = eventStream.pipe(takeWhile(x => x.offset.height < toHeight, true));
  }

  const reader = BufferedStreamReader.fromStream(eventStream);

  while (!stopped) {
    const events = await reader.read(batchSize);
    if (events === undefined) {
      logger.info(`Finished consuming stream ${stream}`);
      break;
    }

    try {
      await handler.handleEvents(events);
    } catch (err) {
      logger.warn("error handling events", err);
      throw err;
    }

    logger.info(
      `handled ${stream}: ${events[events.length - 1].offset.toString()}`
    );
  }

  logger.info(`done consuming stream ${stream} from offset ${currentOffset.toString()} to ${toHeight}`)
}

async function getStreamLastOffset(stream: string): Promise<Offset | undefined> {
  const registry = new StreamRegistryClient();
  const streamInfo = await registry.findStream(stream);
  if (!streamInfo)
    return undefined;

  return _.chain(streamInfo.endpoints)
    .values()
    .flatMap(x => x.stats.end ? [x.stats.end] : [])
    .maxBy(x => x.height)
    .value();
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
