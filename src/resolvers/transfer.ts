import { Ctx, FieldResolver, Resolver, Root } from "type-graphql";
import { Offer } from "@generated/type-graphql"
import { PrismaClient } from "@prisma/client";
import BigNumber from "bignumber.js";

type Context = {
  prisma: PrismaClient
}

@Resolver(of => Offer)
export class CustomOfferResolver {
  @FieldResolver(type => Number, { nullable: true })
  async givesNum(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    return new BigNumber(offer.gives).div(10**18).toNumber();
  }
}
