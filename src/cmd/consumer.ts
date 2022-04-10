import { PrismaClient } from "@prisma/client";
import {
  ProximaStreamsClient,
  StreamReader,
} from "@proximaone/stream-client-js";
import { Subscription } from "rxjs";
import retry from "async-retry";
import { StateTransitionHandler } from "../common";
import { MangroveEventHandler, TokenEventHandler } from "../state";

const retries = parseInt(process.env["CONSUMER_RETRIES"] ?? "100");
const retryFactor = parseFloat(process.env["CONSUMER_RETRY_FACTOR"] ?? "1.2");
const batchSize = parseInt(process.env["BATCH_SIZE"] ?? "500");

const prisma = new PrismaClient();
const streamClient = new ProximaStreamsClient("streams.proxima.one:443");
const timeout = 10 * 60 * 1000;

let stopped = false;
let subscription: Subscription;

async function main() {
  const streamConsumers = [
    () =>
      consumeStream(
        new MangroveEventHandler(
          prisma,
          "v4.domain-events.polygon-mumbai.mangrove.streams.proxima.one"
        )
      ),
    () =>
      consumeStream(
        new TokenEventHandler(
          prisma,
          "new-tokens.polygon-mumbai.fungible-token.streams.proxima.one"
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

async function consumeStream<T>(handler: StateTransitionHandler) {
  const currentStateRef = await handler.getCurrentStreamState();
  const stream = currentStateRef.stream;

  console.log(`consuming stream ${stream} from state ${currentStateRef.state}`);
  const reader = new StreamReader(streamClient, stream, currentStateRef.state);

  while (!stopped) {
    const transitions = await reader.tryRead(batchSize, timeout);
    if (transitions.length == 0) continue;

    try {
      await handler.handleTransitions(transitions);
    } catch (err) {
      console.error("error handling transitions", err);
      throw err;
    }

    console.log(
      `handled ${stream}: ${transitions[
        transitions.length - 1
      ].newState.toString()}`
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
