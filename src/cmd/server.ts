import "reflect-metadata";

import { PrismaClient } from "@prisma/client";
import * as graphql from "@generated/type-graphql";
import { buildSchema } from "type-graphql";
import { ApolloServer } from "@apollo/server";
import express from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import {
  CustomMakerBalanceFieldsResolver,
  CustomMangroveFieldsResolver,
  CustomOfferFieldsResolver,
  CustomOfferListFieldsResolver,
  CustomOfferVersionFieldsResolver,
  CustomOrderFieldsResolver,
  CustomOrderSummaryFieldsResolver,
  CustomTakenOfferFieldsResolver,
  CustomTakerApprovalFieldsResolver,
  CustomTokenFieldsResolver,
} from "../resolvers/customFieldResolvers";

const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

async function main() {
  const schema = await buildSchema({
    resolvers: [
      graphql.FindManyAccountResolver,
      graphql.FindManyChainResolver,
      graphql.FindManyMakerBalanceResolver,
      graphql.FindManyMakerBalanceVersionResolver,
      graphql.FindManyMangroveResolver,
      graphql.FindManyMangroveVersionResolver,
      graphql.FindManyOfferListResolver,
      graphql.FindManyOfferListVersionResolver,
      graphql.FindManyOfferResolver,
      graphql.FindManyOfferVersionResolver,
      graphql.FindManyOrderResolver,
      graphql.FindManyOrderSummaryResolver,
      graphql.FindManyStratResolver,
      graphql.FindManyStreamsResolver,
      graphql.FindManyTakerApprovalResolver,
      graphql.FindManyTakerApprovalVersionResolver,
      graphql.FindManyTokenResolver,
      graphql.FindManyTransactionResolver,

      graphql.AggregateAccountResolver,
      graphql.AggregateChainResolver,
      graphql.AggregateMakerBalanceResolver,
      graphql.AggregateMakerBalanceVersionResolver,
      graphql.AggregateMangroveResolver,
      graphql.AggregateMangroveVersionResolver,
      graphql.AggregateOfferListResolver,
      graphql.AggregateOfferVersionResolver,
      graphql.AggregateOfferResolver,
      graphql.AggregateOfferVersionResolver,
      graphql.AggregateOrderResolver,
      graphql.AggregateOrderSummaryResolver,
      graphql.AggregateStratResolver,
      graphql.AggregateStreamsResolver,
      graphql.AggregateTakerApprovalResolver,
      graphql.AggregateTakerApprovalVersionResolver,
      graphql.AggregateTokenResolver,
      graphql.AggregateTransactionResolver,

      graphql.GroupByAccountResolver,
      graphql.GroupByChainResolver,
      graphql.GroupByMakerBalanceResolver,
      graphql.GroupByMakerBalanceVersionResolver,
      graphql.GroupByMangroveResolver,
      graphql.GroupByMangroveVersionResolver,
      graphql.GroupByOfferListResolver,
      graphql.GroupByOfferVersionResolver,
      graphql.GroupByOfferResolver,
      graphql.GroupByOfferVersionResolver,
      graphql.GroupByOrderResolver,
      graphql.GroupByOrderSummaryResolver,
      graphql.GroupByStratResolver,
      graphql.GroupByStreamsResolver,
      graphql.GroupByTakerApprovalResolver,
      graphql.GroupByTakerApprovalVersionResolver,
      graphql.GroupByTokenResolver,
      graphql.GroupByTransactionResolver,

      graphql.FindUniqueAccountResolver,
      graphql.FindUniqueChainResolver,
      graphql.FindUniqueMakerBalanceResolver,
      graphql.FindUniqueMakerBalanceVersionResolver,
      graphql.FindUniqueMangroveResolver,
      graphql.FindUniqueMangroveVersionResolver,
      graphql.FindUniqueOfferListResolver,
      graphql.FindUniqueOfferVersionResolver,
      graphql.FindUniqueOfferResolver,
      graphql.FindUniqueOfferVersionResolver,
      graphql.FindUniqueOrderResolver,
      graphql.FindUniqueOrderSummaryResolver,
      graphql.FindUniqueStratResolver,
      graphql.FindUniqueStreamsResolver,
      graphql.FindUniqueTakerApprovalResolver,
      graphql.FindUniqueTakerApprovalVersionResolver,
      graphql.FindUniqueTokenResolver,
      graphql.FindUniqueTransactionResolver,

      graphql.AccountRelationsResolver,
      graphql.ChainRelationsResolver,
      graphql.MakerBalanceRelationsResolver,
      graphql.MakerBalanceVersionRelationsResolver,
      graphql.MangroveRelationsResolver,
      graphql.MangroveVersionRelationsResolver,
      graphql.OfferListRelationsResolver,
      graphql.OfferVersionRelationsResolver,
      graphql.OfferRelationsResolver,
      graphql.OfferVersionRelationsResolver,
      graphql.OrderRelationsResolver,
      graphql.OrderSummaryRelationsResolver,
      graphql.StratRelationsResolver,
      graphql.TakerApprovalRelationsResolver,
      graphql.TakerApprovalVersionRelationsResolver,
      graphql.TokenRelationsResolver,
      graphql.TransactionRelationsResolver,

      CustomMakerBalanceFieldsResolver,
      CustomMangroveFieldsResolver,
      CustomOfferFieldsResolver,
      CustomOfferListFieldsResolver,
      CustomOfferVersionFieldsResolver,
      CustomOrderFieldsResolver,
      CustomOrderSummaryFieldsResolver,
      CustomTakenOfferFieldsResolver,
      CustomTakerApprovalFieldsResolver,
      CustomTokenFieldsResolver,
    ],
    validate: false,
  });

  const app = express();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: " To many calls from this IP"
  });

  app.use(limiter);
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    schema,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await server.start();

  app.use(
    "/",
    cors(),
    bodyParser.json(),
    expressMiddleware(server, {
      context: async ({ req, res }) => ({
        prisma,
      }),
    })
  );

  httpServer.listen({ port: PORT });

  // await new Promise((resolve) => httpServer.listen({ port: PORT }));
  console.log(`🚀 Server ready at http://localhost:4000/`);
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
