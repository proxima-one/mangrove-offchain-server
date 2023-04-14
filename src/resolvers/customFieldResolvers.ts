import {
  MangroveOrder,
  MangroveOrderVersion,
  Offer,
  OfferListing,
  OfferVersion,
  Order,
  TakenOffer,
  Token
} from "@generated/type-graphql";
import { PrismaClient, TokenBalanceEventSource } from "@prisma/client";
import { Arg, Ctx, FieldResolver, Query, Resolver, Root } from "type-graphql";

// At most re-fetch once per 1000 ms for each token
import BigNumber from "bignumber.js";
import { MemoryCache, fetchBuilder } from "node-fetch-cache";
import { OfferListingUtils } from "src/state/dbOperations/offerListingUtils";
import { AccountId, ChainId, KandelId, MangroveId, OfferListingId } from "src/state/model";
import { KandelDepositWithdraw, KandelFailedOffers, KandelFills, KandelOffer, KandelParameters, KandelPopulateRetract, KandelStrategy } from "./kandelObjects";
import { MangroveOrderFills, MangroveOrderOpenOrder } from "./mangroveOrderObjects";
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

@Resolver()
export class KandelManageStrategyPageResolver {

  @Query(() => KandelOffer)
  async kandelOffers(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelOffer[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const offers = await ctx.prisma.offer.findMany({ where: { makerId: kandelId.value }, include: { kandelOfferIndexes: true, currentVersion: true, offerListing: { select: { inboundToken: true, outboundToken: true } } } })
    return offers.map(o => new KandelOffer({
      inbound: o.offerListing.inboundToken,
      outbound: o.offerListing.outboundToken,
      inboundAmount: o.currentVersion ? o.currentVersion.wants : "0",
      outboundAmount: o.currentVersion ? o.currentVersion.gives : "0",
      id: o.offerNumber,
      index: o.kandelOfferIndexes ? o.kandelOfferIndexes.index : 0
    }))
  }

}

@Resolver()
export class MangroveOrderResolver {

  @Query(() => MangroveOrderOpenOrder)
  async mangroveOrderOpenOrders(
    @Arg("taker") taker: string,
    @Arg("mangrove") mangrove: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderOpenOrder[]> {
    const mangroveOrders = await ctx.prisma.mangroveOrder.findMany({ where: { mangrove: { address: mangrove, chainId: chain }, order: { taker: { address: taker } }, offer: { currentVersion: { deleted: false } } }, include: { currentVersion: true, order: { select: { tx: true } }, taker: true, offer: { include: { offerListing: { include: { inboundToken: true, outboundToken: true } } } } } })
    return mangroveOrders.map(m => new MangroveOrderOpenOrder({
      fillWants: m.fillWants,
      totalFee: m.totalFee,
      id: m.id,
      taker: m.taker.address,
      inboundToken: m.offer?.offerListing.inboundToken,
      outboundToken: m.offer?.offerListing.outboundToken,
      price: m.currentVersion?.price.toString() ?? undefined,
      cancelled: m.currentVersion?.cancelled,
      failed: m.currentVersion?.failed,
      failedReason: m.currentVersion?.failedReason ?? undefined,
      filled: m.currentVersion?.filled,
      expiryDate: m.currentVersion?.expiryDate,
      takerGot: m.currentVersion?.takerGot,
      date: m.order.tx.time,
      takerWants: m.takerWants,
    })).sort((v1, v2) => v1.date.getTime() - v2.date.getTime());
  }


  @Query(() => MangroveOrderFills)
  async mangroveOrderFills(
    @Arg("taker") taker: string,
    @Arg("mangrove") mangrove: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderFills[]> {
    const mangroveOrders = await ctx.prisma.mangroveOrder.findMany({ where: { mangrove: { address: mangrove, chainId: chain }, order: { taker: { address: taker } }, currentVersion: { filled: true } }, include: { currentVersion: true, order: { select: { tx: true } }, taker: true, offer: { include: { offerListing: { include: { inboundToken: true, outboundToken: true } } } } } })
    return mangroveOrders.map(m => new MangroveOrderFills({
      fillWants: m.fillWants,
      restingOrderId: m.restingOrderId ?? undefined,
      totalFee: m.totalFee,
      id: m.id,
      taker: m.taker.address,
      inboundToken: m.offer?.offerListing.inboundToken,
      outboundToken: m.offer?.offerListing.outboundToken,
      price: m.currentVersion?.price.toString() ?? undefined,
      expiryDate: m.currentVersion?.expiryDate,
      takerGot: m.currentVersion?.takerGot,
      firstDate: m.order.tx.time,
      takerWants: m.takerWants,
    })).sort((v1, v2) => v1.firstDate.getTime() - v2.firstDate.getTime());
  }


}



@Resolver()
export class KandelHomePageResolver {

  @Query(() => KandelStrategy)
  async kandelStrategies(
    @Arg("admin") admin: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelStrategy[]> {
    let chainId = new ChainId(chain);
    let adminId = new AccountId(chainId, admin);
    const kandels = await ctx.prisma.kandel.findMany({ where: { currentVersion: { adminId: adminId.value } }, select: { strat: { select: { address: true, offers: { where: { currentVersion: { deleted: false } } } } }, id: true, type: true, baseToken: true, quoteToken: true, reserve: { select: { address: true, TokenBalance: { select: { tokenId: true, currentVersion: { select: { deposit: true, withdrawal: true } } } } } } } })

    return kandels.map(kandel => {
      return new KandelStrategy({
        name: kandel.type,
        address: kandel.strat.address,
        reserve: kandel.reserve.address,
        tokenA: kandel.baseToken,
        tokenB: kandel.quoteToken,
        return: "", //TODO:
        status: kandel.strat.offers.length > 0 ? "active" : "closed" // inactive makes no sense
      });
    });
  }

  @Query(() => KandelStrategy)
  async kandelStrategy(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelStrategy> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const kandel = await ctx.prisma.kandel.findUnique({ where: { id: kandelId.value }, select: { strat: { select: { address: true, offers: { where: { currentVersion: { deleted: false } } } } }, id: true, type: true, baseToken: true, quoteToken: true, reserve: { select: { address: true, TokenBalance: { select: { tokenId: true, currentVersion: { select: { deposit: true, withdrawal: true } } } } } } } })
    if (!kandel) {
      throw Error(`Cannot find kandel with address: ${address} and chain: ${chain}`);
    }


    return new KandelStrategy({
      name: kandel.type,
      address: kandel.strat.address,
      reserve: kandel.reserve.address,
      tokenA: kandel.baseToken,
      tokenB: kandel.quoteToken,
      return: "", //TODO:
      status: kandel.strat.offers.length > 0 ? "active" : "closed" // inactive makes no sense
    });
  }
}

@Resolver()
export class KandelHistoryResolver {

  @Query(() => KandelFills)
  async kandelFills(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context

  ): Promise<KandelFills[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const fills = await ctx.prisma.takenOffer.findMany({ where: { offerVersion: { offer: { makerId: kandelId.value } }, failReason: null }, select: { takerGave: true, takerGot: true, order: { select: { tx: { select: { time: true } }, offerListing: { select: { inboundToken: {}, outboundToken: {} } } } } } });
    return fills.map(v => new KandelFills(v)).sort((v1, v2) => v1.date.getTime() - v2.date.getTime());
  }

  @Query(() => KandelFailedOffers)
  async kandelFailedOffers(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelFailedOffers[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const failedOffer = await ctx.prisma.takenOffer.findMany({ where: { offerVersion: { offer: { makerId: kandelId.value } }, OR: [{ NOT: { failReason: null } }, { posthookFailed: true }] }, select: { takerGave: true, takerGot: true, order: { select: { tx: { select: { time: true } }, offerListing: { select: { inboundToken: {}, outboundToken: {} } } } } } });
    return failedOffer.map(v => new KandelFailedOffers(v)).sort((v1, v2) => v1.date.getTime() - v2.date.getTime());
  }


  @Query(() => KandelDepositWithdraw)
  async kandelDepositWithdraw(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelDepositWithdraw[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let withdrawals = await ctx.prisma.tokenBalanceWithdrawalEvent.findMany({ where: { tokenBalanceEvent: { kandelId: kandelId.value }, source: TokenBalanceEventSource.KANDEL }, select: { value: true, tokenBalanceEvent: { select: { token: true, tokenBalanceVersion: { select: { tx: { select: { time: true } } } } } } } });
    let deposits = await ctx.prisma.tokenBalanceDepositEvent.findMany({ where: { tokenBalanceEvent: { kandelId: kandelId.value }, source: TokenBalanceEventSource.KANDEL }, select: { value: true, tokenBalanceEvent: { select: { token: true, tokenBalanceVersion: { select: { tx: { select: { time: true } } } } } } } });
    return [
      ...deposits.map(v => new KandelDepositWithdraw({ ...v, event: "deposit" })),
      ...withdrawals.map(v => new KandelDepositWithdraw({ ...v, event: "withdraw" }))
    ].sort((v1, v2) => v1.date.getTime() - v2.date.getTime());
  }


  @Query(() => KandelParameters)
  async kandelParameters(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelParameters[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let adminEvents = await ctx.prisma.kandelAdminEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { admin: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { admin: { select: { address: true } } } } } } } } } });
    let gasReqEvents = await ctx.prisma.kandelGasReqEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { gasReq: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { gasReq: true } } } } } } } } } });
    let lengthEvents = await ctx.prisma.kandelLengthEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { length: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { length: true } } } } } } } } } });
    let routerEvents = await ctx.prisma.kandelRouterEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { router: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { routerAddress: true } } } } } } } });
    let gasPriceEvents = await ctx.prisma.kandelGasPriceEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { gasPrice: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { gasPrice: true } } } } } } } } } });
    let compoundRateEvents = await ctx.prisma.kandelCompoundRateEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { compoundRateBase: true, compoundRateQuote: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { compoundRateBase: true, compoundRateQuote: true } } } } } } } } } });
    let geometricEvents = await ctx.prisma.kandelGeometricParamsEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { ratio: true, spread: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { ratio: true, spread: true } } } } } } } } } });
    // let newKandelEvents = await ctx.prisma.newKandelEvent.findMany( { where: { event: { kandelId: kandelId.value}, NOT: { event: { KandelVersion: null}} }, include: { event: { select: { KandelVersion: { select: { tx: { select: { time:true} }, prevVersion: true } } } }  } });

    return [
      ...adminEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.admin.address }, type: "admin", value: v.admin })),
      ...gasReqEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.gasReq }, type: "gasReq", value: v.gasReq })),
      ...lengthEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.length.toString() }, type: "length", value: v.length.toString() })),
      ...routerEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.routerAddress }, type: "router", value: v.router })),
      ...gasPriceEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.gasPrice }, type: "gasPrice", value: v.gasPrice })),
      ...compoundRateEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.compoundRateBase.toString() }, type: "compoundRateBase", value: v.compoundRateBase.toString() })),
      ...compoundRateEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.compoundRateQuote.toString() }, type: "compoundRateQuote", value: v.compoundRateQuote.toString() })),
      ...geometricEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.ratio.toString() }, type: "ratio", value: v.ratio.toString() })),
      ...geometricEvents.map(v => new KandelParameters({ event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration.spread.toString() }, type: "spread", value: v.spread.toString() })),
      // ...newKandelEvents.map( v => new KandelParameters( { event: { tx: { time: v.event.KandelVersion?.tx.time }, prevVersion: v.event.KandelVersion?.prevVersion?.configuration. }, type: "spread" , value: v.spread } ) ),
    ].sort((v1, v2) => v1.date!.getTime() - v2.date!.getTime());;
  }


  @Query(() => KandelPopulateRetract)
  async kandelPopulateRetract(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelPopulateRetract[]> {
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let populateEvents = await ctx.prisma.kandelPopulateEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { OfferVersion: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } } });
    let { inboundToken: tokenA, outboundToken: tokenB } = populateEvents[0].OfferVersion[0].offer.offerListing;
    const populates = populateEvents.map(v => {
      return {
        tokenA,
        tokenAAmount: v.OfferVersion.filter(o => o.offer.offerListing.inboundToken.id === tokenA.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()),
        tokenB,
        tokenBAmount: v.OfferVersion.filter(o => o.offer.offerListing.inboundToken.id === tokenB.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()),
        date: v.event.KandelVersion?.tx.time
      }
    }).map(v => new KandelPopulateRetract({ ...v, event: "populate" }));


    let retractEvents = await ctx.prisma.kandelRetractEvent.findMany({ where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null } } }, select: { OfferVersion: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } } });
    const retracts = retractEvents.map(v => {
      return {
        tokenA,
        tokenAAmount: v.OfferVersion.filter(o => o.offer.offerListing.inboundToken.id === tokenA.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()),
        tokenB,
        tokenBAmount: v.OfferVersion.filter(o => o.offer.offerListing.inboundToken.id === tokenB.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()),
        date: v.event.KandelVersion?.tx.time
      }
    }).map(v => new KandelPopulateRetract({ ...v, event: "retract" }));


    return [...populates, ...retracts].sort((v1, v2) => v1.date!.getTime() - v2.date!.getTime());;
  }

}



@Resolver((of) => OfferListing)
export class CustomOfferListingFieldsResolver {

  @FieldResolver((type) => [OfferVersion], { nullable: true })
  async offersAtTime(
    @Arg("time") time: number,
    @Root() offerListing: OfferListing,
    @Ctx() ctx: Context
  ): Promise<OfferVersion[] | null> {
    const mangrove = await ctx.prisma.mangrove.findUnique({ where: { id: offerListing.mangroveId } })
    const inboundToken = await ctx.prisma.token.findUnique({ where: { id: offerListing.inboundTokenId } })
    const outboundToken = await ctx.prisma.token.findUnique({ where: { id: offerListing.outboundTokenId } })
    if (!mangrove || !inboundToken || !outboundToken) {
      return null;
    }
    const chainId = new ChainId(mangrove.chainId);
    const mangroveId = new MangroveId(chainId, offerListing.mangroveId);
    const offerListingId = new OfferListingId(mangroveId, { inboundToken: inboundToken.address, outboundToken: outboundToken.address })
    return await new OfferListingUtils(ctx.prisma).getMatchingOfferFromOfferListingId(offerListingId, time);

  }
}

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
  @FieldResolver((type) => OfferVersion, { nullable: true })
  async currentVersion(
    @Root() offer: Offer,
    @Ctx() ctx: Context
  ): Promise<OfferVersion | null> {
    return await ctx.prisma.offerVersion.findUnique({
      where: { id: offer.currentVersionId },
    });
  }
}

@Resolver((of) => OfferVersion)
export class CustomOfferVersionFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async givesInUsd(
    @Root() offerVersion: OfferVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offerVersion,
      offerVersion.givesNumber,
      findOutboundTokenFromOfferVersionOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async wantsInUsd(
    @Root() offerVersion: OfferVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offerVersion,
      offerVersion.wantsNumber,
      findInboundTokenFromOfferVersionOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerPaysPriceInUsd(
    @Root() offerVersion: OfferVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offerVersion,
      offerVersion.takerPaysPrice,
      findInboundTokenFromOfferVersionOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async makerPaysPriceInUsd(
    @Root() offerVersion: OfferVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      offerVersion,
      offerVersion.makerPaysPrice,
      findOutboundTokenFromOfferVersionOrFail,
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
  async takerGotInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerGotNumber,
      findOutboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerGaveInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerGaveNumber,
      findInboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerPaidPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.takerPaidPrice,
      findInboundTokenFromTakenOfferOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async makerPaidPriceInUsd(
    @Root() takenOffer: TakenOffer,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      takenOffer,
      takenOffer.makerPaidPrice,
      findOutboundTokenFromTakenOfferOrFail,
      ctx
    );
  }
}

@Resolver((of) => MangroveOrder)
export class CustomMangroveOrderFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async takerWantsInUsd(
    @Root() order: MangroveOrder,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.takerWantsNumber,
      findOutboundTokenFromMangroveOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerGivesInUsd(
    @Root() order: MangroveOrder,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.takerGivesNumber,
      findInboundTokenFromMangroveOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async totalFeeInUsd(
    @Root() order: MangroveOrder,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      order,
      order.totalFeeNumber,
      findOutboundTokenFromMangroveOrderOrFail,
      ctx
    );
  }


  @FieldResolver((type) => MangroveOrderVersion, { nullable: true })
  async currentVersion(
    @Root() mangroveOrder: MangroveOrder,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderVersion | null> {
    return await ctx.prisma.mangroveOrderVersion.findUnique({
      where: { id: mangroveOrder.currentVersionId },
    });
  }

}

@Resolver((of) => MangroveOrderVersion)
export class CustomMangroveOrderVersionFieldsResolver {
  @FieldResolver((type) => Number, { nullable: true })
  async takerGotInUsd(
    @Root() order: MangroveOrderVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      await findMangroveOrderFromMangroveOrderVersion(order, ctx.prisma),
      order.takerGotNumber,
      findOutboundTokenFromMangroveOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async takerGaveInUsd(
    @Root() order: MangroveOrderVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      await findMangroveOrderFromMangroveOrderVersion(order, ctx.prisma),
      order.takerGaveNumber,
      findInboundTokenFromMangroveOrderOrFail,
      ctx
    );
  }

  @FieldResolver((type) => Number, { nullable: true })
  async priceInclFeeInUsd(
    @Root() order: MangroveOrderVersion,
    @Ctx() ctx: Context
  ): Promise<number | undefined> {
    return amountFieldToUsd(
      await findMangroveOrderFromMangroveOrderVersion(order, ctx.prisma),
      order.price,
      findInboundTokenFromMangroveOrderOrFail,
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

async function findMangroveOrderFromMangroveOrderVersion(
  mangroveOrderVersion: MangroveOrderVersion,
  prisma: PrismaClient
): Promise<MangroveOrder> {
  const mangroveOrder = await prisma.mangroveOrder.findUnique({
    where: { id: mangroveOrderVersion.mangroveOrderId },
  });
  if (!mangroveOrder) {
    throw Error(
      `Cannot find MangroveOrder from the MangroveOrder id '${mangroveOrderVersion.mangroveOrderId}`
    );
  }
  return mangroveOrder;
}

async function findOutboundTokenFromOfferVersionOrFail(
  offerVersion: OfferVersion,
  prisma: PrismaClient
): Promise<Token> {
  const outboundToken = await prisma.offer
    .findUnique({
      where: { id: offerVersion.offerId },
    })
    .offerListing()
    .outboundToken();
  if (!outboundToken)
    throw Error(`Cannot find outbound token from offer '${offerVersion.id}'`);
  return outboundToken;
}

async function findInboundTokenFromOfferVersionOrFail(
  offerVersion: OfferVersion,
  prisma: PrismaClient
): Promise<Token> {
  const inboundToken = await prisma.offer
    .findUnique({
      where: { id: offerVersion.offerId },
    })
    .offerListing()
    .inboundToken();
  if (!inboundToken)
    throw Error(`Cannot find inbound token from offer '${offerVersion.id}'`);
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
    .offerListing()
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
    .offerListing()
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
    .offerListing()
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
    .offerListing()
    .inboundToken();
  if (!inboundToken)
    throw Error(`Cannot find inbound token from takenOffer '${takenOffer.id}'`);
  return inboundToken;
}

async function findOutboundTokenFromMangroveOrderOrFail(
  mangroveOrder: MangroveOrder,
  prisma: PrismaClient
): Promise<Token> {
  const outboundToken = await prisma.mangroveOrder
    .findUnique({
      where: { id: mangroveOrder.id },
    })
    .offerListing()
    .outboundToken();
  if (!outboundToken)
    throw Error(
      `Cannot find outbound token from mangroveOrder '${mangroveOrder.id}'`
    );
  return outboundToken;
}

async function findInboundTokenFromMangroveOrderOrFail(
  mangroveOrder: MangroveOrder,
  prisma: PrismaClient
): Promise<Token> {
  const inboundToken = await prisma.mangroveOrder
    .findUnique({
      where: { id: mangroveOrder.id },
    })
    .offerListing()
    .inboundToken();
  if (!inboundToken)
    throw Error(
      `Cannot find inbound token from mangroveOrder '${mangroveOrder.id}'`
    );
  return inboundToken;
}
