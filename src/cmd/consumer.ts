import { PrismaClient } from "@prisma/client";
import {
  BufferedStreamReader, Offset,
  ProximaStreamClient, SingleStreamDbRegistry, StreamRegistryClient, Timestamp,
} from "@proximaone/stream-client-js";
import retry from "async-retry";
import * as _ from "lodash";
import { Subscription, takeWhile } from "rxjs";
import { StreamEventHandler } from "src/utils/common";
import {
  MangroveEventHandler,
  IOrderLogicEventHandler as MangroveOrderEventHandler,
  TokenEventHandler,
  IKandelLogicEventHandler as KandelEventHandler,
} from "src/state";
import { ChainId } from "src/state/model";
import { ChainConfig } from "src/utils/config/ChainConfig";
import config from "src/utils/config/config";
import { getChainConfigsOrThrow } from "src/utils/config/configUtils";
import logger from "src/utils/logger";
import { type } from "os";

const retries = parseInt(process.env["CONSUMER_RETRIES"] ?? "100");
const retryFactor = parseFloat(process.env["CONSUMER_RETRY_FACTOR"] ?? "1.2");
const batchSize = parseInt(process.env["BATCH_SIZE"] ?? "200");

const prisma = new PrismaClient();
const registry = new SingleStreamDbRegistry("streams-stage.buh-stage.apps.proxima.one:443");
const streamClient = new ProximaStreamClient();
const kandelStreamClient = new ProximaStreamClient({registry});

let stopped = false;
let subscription: Subscription;

type streamType = "token" | "mangrove" | "mangroveOrder" | "kandel";

type streamLink = {
  handler: StreamEventHandler, 
  type: streamType,
  toHeight?: bigint
}

type streamLinks = {
  stream: streamLink[]
  then?: streamLinks[]
}

async function main() {
  const streamLinks: streamLinks[] = [];
  for (const chain of getChainConfigsOrThrow<ChainConfig>(config)) {
    logger.info(`consuming chain ${chain.id} using following streams ${JSON.stringify(chain.streams)}`);
    const chainId = new ChainId(parseInt( chain.id) );
    const tokenPreloads: streamLink[] = [];
    const mangrovePreloads: streamLink[] = [];
    const mangroveOrderPreloads: streamLink[] = [];
    const kandelPreloads: streamLink[] = [];

    const tokenStreams = chain.streams.tokens ?? [];
    for (const tokenStream of tokenStreams) {
      const lastOffset = await getStreamLastOffset(tokenStream);
      if (lastOffset){
        tokenPreloads.push({handler: new TokenEventHandler(prisma, tokenStream, chainId), type: "token", toHeight: lastOffset.height });
      }

    }

    const mangroveStreams = chain.streams.mangrove ?? [];
    for (const mangroveStream of mangroveStreams) {
      const lastOffset = await getStreamLastOffset(mangroveStream);
      if (lastOffset)
        mangrovePreloads.push({handler: new MangroveEventHandler(prisma, mangroveStream, chainId), type: "mangrove", toHeight: lastOffset.height });

    }

    const mangroveOrderStreams = chain.streams.strats ?? [];
    for (const mangroveOrderStream of mangroveOrderStreams) {
      mangroveOrderPreloads.push({handler: new MangroveOrderEventHandler(prisma, mangroveOrderStream, chainId), type: "mangroveOrder" })
    }

    const kandelStreams = chain.streams.kandel ?? [];
    for (const kandelStream of kandelStreams) {
      kandelPreloads.push({handler: new KandelEventHandler(prisma, kandelStream, chainId), type: "kandel"})
    }

    streamLinks.push( { stream: tokenPreloads, then: [{ stream: mangrovePreloads, then: [{stream: [...mangroveOrderPreloads, ...kandelPreloads] }] }] } )
  }

  await Promise.all( 
    streamLinks.map( value => handleStreamLinks(value))
   )

}

async function handleStreamLinks( streamLink: streamLinks){
  await Promise.all(  streamLink.stream.map( ( ({handler, type, toHeight}) => {
        return retry( () => consumeStream({ handler, type, toHeight: toHeight ?? BigInt(0) } ) )
      } ), {
        retries: retries,
        factor: retryFactor,
      } ) );

  const promises:Promise<void[]>[] = []
  const continueStreams = Promise.all(  streamLink.stream.map( ({handler, type }) => {
    return retry( () => consumeStream( { handler, type }) )
  }, {
    retries: retries,
    factor: retryFactor,
  } ) )
  promises.push(continueStreams)
  if(streamLink.then){
    const thenStreamLinks = Promise.all( streamLink.then.map( (value) => handleStreamLinks(value)) );
    promises.push(thenStreamLinks)
  }
  await Promise.all( promises );
}

async function consumeStream(params:{handler: StreamEventHandler, type: streamType, toHeight?: bigint}) {
  
  const currentOffset = await params.handler.getCurrentStreamOffset();
  const stream = params.handler.getStreamName();

  logger.info(
    `consuming stream ${stream} from offset ${currentOffset.height.toString()} to ${params.toHeight}`
  );
  let eventStream = params.type === "kandel" ? await kandelStreamClient.streamEvents(stream, currentOffset) : await streamClient.streamEvents(stream, currentOffset);

  if (params.toHeight != undefined) {
    if (currentOffset.height >= params.toHeight){
      logger.info(`Already caught up on this stream: ${stream}`)
      return;
    }

    eventStream = eventStream.pipe(takeWhile(x => x.offset.height < (params.toHeight ?? BigInt(0)), true));
  }

  
  const READER_BUFFER_SIZE = process.env.READER_BUFFER_SIZE ? parseInt( process.env.READER_BUFFER_SIZE ) : undefined;
  const reader = BufferedStreamReader.fromStream(eventStream, READER_BUFFER_SIZE );
  while (!stopped) {
    const events = await reader.read(batchSize);
    if (events === undefined) {
      logger.info(`Finished consuming stream ${stream}`);
      break;
    }

    try {
      await params.handler.handleEvents(events);
    } catch (err) {
      logger.warn(`error handling events ${err}`);
      throw err;
    }

    logger.info(
      `handled ${stream}: ${events[events.length - 1].offset.height.toString()}, bufferSize: ${reader.buffer.length}`
    );
  }

  logger.info(`done consuming stream ${stream} from offset ${currentOffset.height.toString()} to ${params.toHeight}`)
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
