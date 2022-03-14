import "reflect-metadata";

import { PrismaClient } from "@prisma/client";
import * as graphql from "@generated/type-graphql";
import { buildSchema } from "type-graphql";
import { ApolloServer } from "apollo-server";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";
import { CustomOfferResolver } from "../resolvers/transfer";

const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

async function main() {
  const schema = await buildSchema({
    resolvers: [
      graphql.FindManyAccountResolver,
      graphql.FindManyMakerBalanceResolver,
      graphql.FindManyMangroveResolver,
      graphql.FindManyOfferListResolver,
      graphql.FindManyOfferResolver,
      graphql.FindManyOrderResolver,
      graphql.FindManyTakerApprovalResolver,
      graphql.FindManyChainResolver,

      graphql.AggregateAccountResolver,
      graphql.AggregateMakerBalanceResolver,
      graphql.AggregateMangroveResolver,
      graphql.AggregateOfferListResolver,
      graphql.AggregateOfferResolver,
      graphql.AggregateOrderResolver,
      graphql.AggregateTakerApprovalResolver,
      graphql.AggregateChainResolver,

      graphql.AggregateAccountResolver,
      graphql.AggregateMakerBalanceResolver,
      graphql.AggregateMangroveResolver,
      graphql.AggregateOfferListResolver,
      graphql.AggregateOfferResolver,
      graphql.AggregateOrderResolver,
      graphql.AggregateTakerApprovalResolver,
      graphql.AggregateChainResolver,

      graphql.GroupByAccountResolver,
      graphql.GroupByMakerBalanceResolver,
      graphql.GroupByMangroveResolver,
      graphql.GroupByOfferListResolver,
      graphql.GroupByOfferResolver,
      graphql.GroupByOrderResolver,
      graphql.GroupByTakerApprovalResolver,
      graphql.GroupByChainResolver,

      graphql.FindUniqueAccountResolver,
      graphql.FindUniqueMakerBalanceResolver,
      graphql.FindUniqueMangroveResolver,
      graphql.FindUniqueOfferListResolver,
      graphql.FindUniqueOfferResolver,
      graphql.FindUniqueOrderResolver,
      graphql.FindUniqueTakerApprovalResolver,
      graphql.FindUniqueChainResolver,

      graphql.AccountRelationsResolver,
      graphql.MakerBalanceRelationsResolver,
      graphql.MangroveRelationsResolver,
      graphql.OfferListRelationsResolver,
      graphql.OfferRelationsResolver,
      graphql.OrderRelationsResolver,
      graphql.TakerApprovalRelationsResolver,
      graphql.ChainRelationsResolver,

      CustomOfferResolver
    ],
    validate: false,
  });

  const server = new ApolloServer({
    schema: schema,
    introspection: true,
    plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
    context: {
      prisma,
    },
  });

  const { url } = await server.listen(PORT);
  console.log(`Server is running, GraphQL Playground available at ${url}`);
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
