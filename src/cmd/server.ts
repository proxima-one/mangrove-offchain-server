import "reflect-metadata";
import * as graphql from "@generated/type-graphql";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from "@apollo/server/plugin/landingPage/default";
import { PrismaClient } from "@prisma/client";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import { AddressInfo } from "net";
import {
  KandelHistoryResolver,
  KandelHomePageResolver,
  KandelManageStrategyPageResolver,
  MangroveOrderResolver,
} from "src/resolvers/customFieldResolvers";
import logger from "src/utils/logger";
import { NonEmptyArray, buildSchema } from "type-graphql";

const prisma = new PrismaClient();

async function main() {
  const WITH_RESOLVERS = process.env.WITH_RESOLVERS === "true";

  const custom:NonEmptyArray<Function> = [
    KandelHistoryResolver,
    KandelHomePageResolver,
    KandelManageStrategyPageResolver,
    MangroveOrderResolver,
    ...(WITH_RESOLVERS ? Array.from( graphql.resolvers.values() ) : [])
   ];
  


  const schema = await buildSchema({
    resolvers: custom,
    validate: false,
  });

  const PORT = process.env.PORT || 4000;
  const WINDOW = process.env.RATE_LIMIT_WINDOW
    ? parseFloat(process.env.RATE_LIMIT_WINDOW)
    : 15;
  const MAX = process.env.RATE_LIMIT_MAX
    ? parseInt(process.env.RATE_LIMIT_MAX)
    : 100;

  const app = express();

  const limiter = rateLimit({
    windowMs: WINDOW * 60 * 1000, // 15 minutes
    max: MAX, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: " To many calls from this IP",
  });

  app.use(limiter);
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    schema,
    introspection: process.env.GRAPHQL_PRODUCTION === "false",
    
    plugins: [
      // Install a landing page plugin based on NODE_ENV
      process.env.GRAPHQL_PRODUCTION === "true"
        ? ApolloServerPluginLandingPageProductionDefault({
            graphRef: "my-graph-id@my-graph-variant",
            footer: false,
          })
        : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
  });

  await server.start();

  app.use(
    "/",
    cors(),
    bodyParser.json(),
    expressMiddleware(server, {
      context: async () => ({
        prisma,
      }),
    })
  );

  const thisServer = httpServer.listen({ port: PORT });

  const address = thisServer.address();
  let url = "http://localhost:" + PORT;
  if (typeof address === "string" && address != "::") {
    url = address;
  } else if (address && (address as AddressInfo).address != "::") {
    url =
      (address as AddressInfo).address + ":" + (address as AddressInfo).port;
  }

  // await new Promise((resolve) => httpServer.listen({ port: PORT }));
  logger.info(`🚀 Server ready at ${url}`);
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
