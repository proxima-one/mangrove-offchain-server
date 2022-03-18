import { Ctx, FieldResolver, Resolver, Root } from "type-graphql";
import { Offer, OfferList, Order, TakenOffer, Token } from "@generated/type-graphql"
import { PrismaClient } from "@prisma/client";
import BigNumber from "bignumber.js";

// At most re-fetch once per 1000 ms for each token
import { fetchBuilder, MemoryCache } from "node-fetch-cache";
const fetch = fetchBuilder.withCache(new MemoryCache({ttl: 1000}));
async function fetchTokenPriceInUsd(token: Token) {
  return await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${token.symbol}&tsyms=USD`)
    .then((response: any) => response.json())
    .then((json: any) => json["USD"])
    .catch(() => undefined) as number;
}

type Context = {
  prisma: PrismaClient
}

@Resolver(of => Token)
export class CustomTokenFieldsResolver {
  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() token: Token,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    return await fetchTokenPriceInUsd(token);
  }
}

@Resolver(of => Offer)
export class CustomOfferFieldsResolver {
  @FieldResolver(type => Number, { nullable: true })
  async givesAsNumber(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const outboundToken = await findOutboundTokenFromOfferOrFail(offer, prisma);
    return new BigNumber(offer.gives).shiftedBy(-outboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async givesInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      this.givesAsNumber.bind(this),
      findOutboundTokenFromOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async wantsAsNumber(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromOfferOrFail(offer, prisma);
    return new BigNumber(offer.wants).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async wantsInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      this.wantsAsNumber.bind(this),
      findInboundTokenFromOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPrice(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const givesAsNumber = await this.givesAsNumber(offer, { prisma });
    const wantsAsNumber = await this.wantsAsNumber(offer, { prisma });
    if (!givesAsNumber || !wantsAsNumber) return undefined;
    return wantsAsNumber/givesAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      this.takerPaysPrice.bind(this),
      findInboundTokenFromOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPrice(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const givesAsNumber = await this.givesAsNumber(offer, { prisma });
    const wantsAsNumber = await this.wantsAsNumber(offer, { prisma });
    if (!givesAsNumber || !wantsAsNumber) return undefined;
    return givesAsNumber/wantsAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() offer: Offer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offer,
      this.makerPaysPrice.bind(this),
      findOutboundTokenFromOfferOrFail,
      ctx);
  }
}

@Resolver(of => Order)
export class CustomOrderFieldsResolver {
  @FieldResolver(type => Number, { nullable: true })
  async takerGotAsNumber(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const outboundToken = await findOutboundTokenFromOrderOrFail(order, prisma);
    return new BigNumber(order.takerGot).shiftedBy(-outboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerGotInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      this.takerGotAsNumber.bind(this),
      findOutboundTokenFromOrderOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerGaveAsNumber(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromOrderOrFail(order, prisma);
    return new BigNumber(order.takerGave).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerGaveInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      this.takerGaveAsNumber.bind(this),
      findInboundTokenFromOrderOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPrice(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGotAsNumber = await this.takerGotAsNumber(order, { prisma });
    const takerGaveAsNumber = await this.takerGaveAsNumber(order, { prisma });
    if (!takerGotAsNumber || !takerGaveAsNumber) return undefined;
    return takerGaveAsNumber/takerGotAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      this.takerPaysPrice.bind(this),
      findInboundTokenFromOrderOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPrice(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGotAsNumber = await this.takerGotAsNumber(order, { prisma });
    const takerGaveAsNumber = await this.takerGaveAsNumber(order, { prisma });
    if (!takerGotAsNumber || !takerGaveAsNumber) return undefined;
    return takerGotAsNumber/takerGaveAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() order: Order,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      this.makerPaysPrice.bind(this),
      findOutboundTokenFromOrderOrFail,
      ctx);
  }
}

@Resolver(of => TakenOffer)
export class CustomTakenOfferFieldsResolver {
  @FieldResolver(type => Number, { nullable: true })
  async takerWantsAsNumber(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const outboundToken = await findOutboundTokenFromTakenOfferOrFail(takenOffer, prisma);
    return new BigNumber(takenOffer.takerWants).shiftedBy(-outboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerWantsInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      this.takerWantsAsNumber.bind(this),
      findOutboundTokenFromTakenOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerGivesAsNumber(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromTakenOfferOrFail(takenOffer, prisma);
    return new BigNumber(takenOffer.takerGives).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerGivesInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      this.takerGivesAsNumber.bind(this),
      findInboundTokenFromTakenOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPrice(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGivesAsNumber = await this.takerGivesAsNumber(takenOffer, { prisma });
    const takerWantsAsNumber = await this.takerWantsAsNumber(takenOffer, { prisma });
    if (!takerGivesAsNumber || !takerWantsAsNumber) return undefined;
    return takerGivesAsNumber/takerWantsAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      this.takerPaysPrice.bind(this),
      findInboundTokenFromTakenOfferOrFail,
      ctx);
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPrice(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGivesAsNumber = await this.takerGivesAsNumber(takenOffer, { prisma });
    const takerWantsAsNumber = await this.takerWantsAsNumber(takenOffer, { prisma });
    if (!takerGivesAsNumber || !takerWantsAsNumber) return undefined;
    return takerWantsAsNumber/takerGivesAsNumber;
  }

  @FieldResolver(type => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context,
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      this.makerPaysPrice.bind(this),
      findOutboundTokenFromTakenOfferOrFail,
      ctx);
  }
}

async function amountFieldToUsd<Entity>(
  entity: Entity,
  amountGetter: (e: Entity, ctx: Context) => Promise<number | undefined>,
  tokenGetter: (e: Entity, prisma: PrismaClient) => Promise<Token>,
  ctx: Context
): Promise<number | undefined> {
  const token = await tokenGetter(entity, ctx.prisma);
  const tokenPriceInUsd = await fetchTokenPriceInUsd(token);
  const amount = await amountGetter(entity, ctx);
  if (!amount || !tokenPriceInUsd) return undefined;
  return amount * tokenPriceInUsd;
}

async function findOutboundTokenFromOfferOrFail(offer: Offer, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromOfferOrFail(offer, prisma);
  return findOutboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findInboundTokenFromOfferOrFail(offer: Offer, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromOfferOrFail(offer, prisma);
  return findInboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findOutboundTokenFromOrderOrFail(order: Order, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromOrderOrFail(order, prisma);
  return findOutboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findInboundTokenFromOrderOrFail(order: Order, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromOrderOrFail(order, prisma);
  return findInboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findOutboundTokenFromTakenOfferOrFail(takenOffer: TakenOffer, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromTakenOfferOrFail(takenOffer, prisma);
  return findOutboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findInboundTokenFromTakenOfferOrFail(takenOffer: TakenOffer, prisma: PrismaClient): Promise<Token> {
  const offerList = await findOfferListFromTakenOfferOrFail(takenOffer, prisma);
  return findInboundTokenFromOfferListOrFail(offerList, prisma);
}

async function findOutboundTokenFromOfferListOrFail(offerList: OfferList, prisma: PrismaClient) {
  const outboundToken = await prisma.token.findUnique( { where: { id: offerList.outboundTokenId } } );
  if (!outboundToken) throw Error(`Cannot find outbound token '${offerList.outboundTokenId}' from offerList '${offerList.id}'`);
  return outboundToken;
}

async function findInboundTokenFromOfferListOrFail(offerList: OfferList, prisma: PrismaClient) {
  const inboundToken = await prisma.token.findUnique( { where: { id: offerList.inboundTokenId } } );
  if (!inboundToken) throw Error(`Cannot find inbound token '${offerList.inboundTokenId}' from offerList '${offerList.id}'`);
  return inboundToken;
}

async function findOfferListFromOfferOrFail(offer: Offer, prisma: PrismaClient): Promise<OfferList> {
  const offerList = await prisma.offerList.findUnique( { where: { id: offer.offerListId } } );
  if (!offerList) throw Error(`Cannot find offerList '${offer.offerListId}' from offer '${offer.id}'`);
  return offerList;
}

async function findOfferListFromOrderOrFail(order: Order, prisma: PrismaClient): Promise<OfferList> {
  const offerList = await prisma.offerList.findUnique( { where: { id: order.offerListId } } );
  if (!offerList) throw Error(`Cannot find offerList '${order.offerListId}' from order '${order.id}'`);
  return offerList;
}

async function findOfferListFromTakenOfferOrFail(takenOffer: TakenOffer, prisma: PrismaClient): Promise<OfferList> {
  const order = await findOrderFromTakenOfferOrFail(takenOffer, prisma);
  return findOfferListFromOrderOrFail(order, prisma);
}

async function findOrderFromTakenOfferOrFail(takenOffer: TakenOffer, prisma: PrismaClient): Promise<Order> {
  const order = await prisma.order.findUnique( { where: { id: takenOffer.orderId } } );
  if (!order) throw Error(`Cannot find order '${takenOffer.orderId}' from takenOffer '${takenOffer.id}'`);
  return order;
}
