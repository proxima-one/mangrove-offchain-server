import { Ctx, FieldResolver, Resolver, Root } from "type-graphql";
import { Offer, OfferList, Order, TakenOffer, Token } from "@generated/type-graphql"
import { PrismaClient } from "@prisma/client";
import BigNumber from "bignumber.js";

type Context = {
  prisma: PrismaClient
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
  async wantsAsNumber(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromOfferOrFail(offer, prisma);
    return new BigNumber(offer.wants).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async price(
    @Root() offer: Offer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const givesAsNumber = await this.givesAsNumber(offer, { prisma });
    const wantsAsNumber = await this.wantsAsNumber(offer, { prisma });
    if (!givesAsNumber || !wantsAsNumber) return undefined;
    return wantsAsNumber/givesAsNumber;
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
  async takerGaveAsNumber(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromOrderOrFail(order, prisma);
    return new BigNumber(order.takerGave).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async price(
    @Root() order: Order,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGotAsNumber = await this.takerGotAsNumber(order, { prisma });
    const takerGaveAsNumber = await this.takerGaveAsNumber(order, { prisma });
    if (!takerGotAsNumber || !takerGaveAsNumber) return undefined;
    return takerGaveAsNumber/takerGotAsNumber;
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
  async takerGivesAsNumber(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const inboundToken = await findInboundTokenFromTakenOfferOrFail(takenOffer, prisma);
    return new BigNumber(takenOffer.takerGives).shiftedBy(-inboundToken.decimals).toNumber();
  }

  @FieldResolver(type => Number, { nullable: true })
  async price(
    @Root() takenOffer: TakenOffer,
    @Ctx() { prisma }: Context,
  ): Promise<number | undefined> {
    const takerGivesAsNumber = await this.takerGivesAsNumber(takenOffer, { prisma });
    const takerWantsAsNumber = await this.takerWantsAsNumber(takenOffer, { prisma });
    if (!takerGivesAsNumber || !takerWantsAsNumber) return undefined;
    return takerGivesAsNumber/takerWantsAsNumber;
  }
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
