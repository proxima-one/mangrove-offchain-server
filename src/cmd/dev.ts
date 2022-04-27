#!/usr/bin/env node

import * as dotenv from "dotenv";
import { program } from "commander";
import {Event, ProximaStreamsClient, State, StreamStateRef, Transition} from "@proximaone/stream-client-js";
import {filter, map, takeWhile, tap} from "rxjs";
import * as mangroveSchema from "@proximaone/stream-schema-mangrove";

dotenv.config();
const orderId = "polygon-mumbai-0xa34b-0xc873x0xf61c-0xef556623fb2757b42db21a7886c40ff64e25ffbc646e38464139f0bb0ece93f3-0";

const proximaClient = new ProximaStreamsClient("streams.proxima.one:443");

const defaultStream = "v4.domain-events.polygon-mumbai.mangrove.streams.proxima.one";

async function main() {
  program
    .name("dev")
    .usage("<command> [options]");

  program
    .command("filter-order <orderId>")
    .option("-s, --stream", "stream", defaultStream)
    .action(async (orderId, options) => {
      console.log(`looking for order ${orderId} in ${options.stream}`);
      const $stream = proximaClient.streamTransitionsAfter(new StreamStateRef(options.stream, State.genesis)).pipe(tap(notifyProgress));
      const filtered = $stream.pipe(
        map(x => deserializeMangroveEvent(x)),
        filter(x => x.event.payload.type == "OrderCompleted" && x.event.payload.id == orderId),
        );

      filtered.subscribe(x => {
        console.dir(x, {depth: 10});
      });
    });

  program
    .command("dump-stream")
    .option("-s, --stream <stream>", "stream", defaultStream)
    .option("-f, --from <from>", "state from", State.genesis.id)
    .option("-f, --to <to>", "state to", "")
    .action(async (options) => {
      console.log(`dumping stream ${options.stream} from ${options.from}`);
      const $stream = proximaClient.streamTransitionsAfter(new StreamStateRef(options.stream, new State(options.from)));

      const stateTo = options.to ? new State(options.to) : undefined;
      const deserialized = $stream.pipe(
        takeWhile(x => {
          return stateTo ? x.newState.id !== stateTo.id : true;
        }),
        map(x => deserializeMangroveEvent(x)),
        );

      deserialized.subscribe(x => {
        console.dir(x, {depth: 10});
      });
    });

  await program.parseAsync(process.argv);
}

function deserializeMangroveEvent({newState, event}: Transition) {
  return {
    event: {
      payload: mangroveSchema.streams.mangrove.serdes.deserialize(event.payload),
      undo: event.undo,
      timestamp: event.timestamp
    },
    newState: newState,
  };
}

let lastNotified = 0;
function notifyProgress(transition: Transition) {
  if (new Date().getTime() - lastNotified < 5000)
    return;
  console.log(`progress: ${transition.newState.id}`);
  lastNotified = new Date().getTime();
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
  });
