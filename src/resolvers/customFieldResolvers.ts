import { Ctx, FieldResolver, Resolver, Root } from "type-graphql";
import { Offer, Order, TakenOffer, Token } from "@generated/type-graphql";
import { PrismaClient } from "@prisma/client";

// At most re-fetch once per 1000 ms for each token
import { fetchBuilder, MemoryCache } from "node-fetch-cache";
const fetch = fetchBuilder.withCache(new MemoryCache({ ttl: 1000 }));
async function fetchTokenPriceInUsd(token: Token) {
  return (await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${token.symbol}&tsyms=USD`
  )
    .then((response: any) => response.json())
    .then((json: any) => json["USD"])
    .catch(() => undefined)) as number;
}

type Context = {
  prisma: PrismaClient;
};

@Resolver((of) => Token)
export class CustomTokenFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async priceInUsd(
    @Root() token: Token,
    @Ctx() { prisma }: Context
  ): Promise<number | undefined> {
    return await fetchTokenPriceInUsd(token);
  }
}

@Resolver((of) => Offer)
export class CustomOfferFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async givesInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      offer.givesNumber,
      findOutboundTokenFromOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async wantsInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      offer.wantsNumber,
      findInboundTokenFromOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      offer.takerPaysPrice,
      findInboundTokenFromOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      offer.makerPaysPrice,
      findOutboundTokenFromOfferOrFail,
      ctx
    );
  }
}

@Resolver((of) => Order)
export class CustomOrderFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async takerGotInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.takerGotNumber,
      findOutboundTokenFromOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerGaveInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.takerGaveNumber,
      findInboundTokenFromOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerPaidPriceInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.takerPaidPrice,
      findInboundTokenFromOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async makerPaidPriceInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.makerPaidPrice,
      findOutboundTokenFromOrderOrFail,
      ctx
    );
  }
}

@Resolver((of) => TakenOffer)
export class CustomTakenOfferFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async takerWantsInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerWantsNumber,
      findOutboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerGivesInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerGivesNumber,
      findInboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerPaysPrice,
      findInboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.makerPaysPrice,
      findOutboundTokenFromTakenOfferOrFail,
      ctx
    );
  }
}

async function amountFieldToUsd<Entity>(
  entity: Entity,
  amount: number | null | undefined,
  tokenGetter: (e: Entity, prisma: PrismaClient) => Promise<Token>,
  ctx: Context
): Promise<number | undefined> {
  if (!amount) return undefined;
  const token = await tokenGetter(entity, ctx.prisma);
  const tokenPriceInUsd = await fetchTokenPriceInUsd(token);
  if (!tokenPriceInUsd) return undefined;
  return amount * tokenPriceInUsd;
}

async function findOutboundTokenFromOfferOrFail(
  offer: Offer,
  prisma: PrismaClient
): Promise<Token> {
  const outboundToken = await prisma.offer
    .findUnique({
      where: { id: offer.id },
    })
    .offerList()
    .outboundToken();
  if (!outboundToken)
    throw Error(`Cannot find outbound token from offer '${offer.id}'`);
  return outboundToken;
}

async function findInboundTokenFromOfferOrFail(
  offer: Offer,
  prisma: PrismaClient
): Promise<Token> {
  const inboundToken = await prisma.offer
    .findUnique({
      where: { id: offer.id },
    })
    .offerList()
    .inboundToken();
  if (!inboundToken)
    throw Error(`Cannot find inbound token from offer '${offer.id}'`);
  return inboundToken;
}

async function findOutboundTokenFromOrderOrFail(
  order: Order,
  prisma: PrismaClient
): Promise<Token> {
  const outboundToken = await prisma.order
    .findUnique({
      where: { id: order.id },
    })
    .offerList()
    .outboundToken();
  if (!outboundToken)
    throw Error(`Cannot find outbound token from order '${order.id}'`);
  return outboundToken;
}

async function findInboundTokenFromOrderOrFail(
  order: Order,
  prisma: PrismaClient
): Promise<Token> {
  const inboundToken = await prisma.order
    .findUnique({
      where: { id: order.id },
    })
    .offerList()
    .inboundToken();
  if (!inboundToken)
    throw Error(`Cannot find inbound token from order '${order.id}'`);
  return inboundToken;
}

async function findOutboundTokenFromTakenOfferOrFail(
  takenOffer: TakenOffer,
  prisma: PrismaClient
): Promise<Token> {
  const outboundToken = await prisma.takenOffer
    .findUnique({
      where: { id: takenOffer.id },
    })
    .order()
    .offerList()
    .outboundToken();
  if (!outboundToken)
    throw Error(
      `Cannot find outbound token from takenOffer '${takenOffer.id}'`
    );
  return outboundToken;
}

async function findInboundTokenFromTakenOfferOrFail(
  takenOffer: TakenOffer,
  prisma: PrismaClient
): Promise<Token> {
  const inboundToken = await prisma.takenOffer
    .findUnique({
      where: { id: takenOffer.id },
    })
    .order()
    .offerList()
    .inboundToken();
  if (!inboundToken)
    throw Error(`Cannot find inbound token from takenOffer '${takenOffer.id}'`);
  return inboundToken;
}
