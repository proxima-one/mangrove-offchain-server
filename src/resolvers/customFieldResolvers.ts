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
import { KandelDepositWithdraw, KandelFailedOffer, KandelFill, KandelOffer, KandelParameter, KandelPopulateRetract, KandelStrategy } from "./kandelObjects";
import { MangroveOrderFillWithTokens, MangroveOrderOpenOrder } from "./mangroveOrderObjects";
import { GraphQLError } from "graphql";
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

  @Query(() => [KandelOffer])
  async kandelOffers(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelOffer[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const offers = await ctx.prisma.offer.findMany({ take, skip, where: { makerId: kandelId.value }, include: { kandelOfferIndexes: true, currentVersion: true, offerListing: { select: { inboundToken: true, outboundToken: true } } } })
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

  @Query(() => [MangroveOrderOpenOrder])
  async mangroveOrderOpenOrders(
    @Arg("taker") taker: string,
    @Arg("mangrove") mangrove: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderOpenOrder[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    const mangroveOrders = await ctx.prisma.mangroveOrder.findMany({ take, skip, where: { mangrove: { address: mangrove, chainId: chain }, taker: { address: taker } }, include: { currentVersion: true, order: { select: { tx: true } }, taker: true, offerListing: { include: { inboundToken: true, outboundToken: true } } }, orderBy: [{ currentVersion: { cancelled: 'asc' } }, { currentVersion: { filled: 'asc' } }, { currentVersion: { expiryDate: 'desc' } }] })
    return mangroveOrders.map(m => new MangroveOrderOpenOrder({
      side: m.fillWants ? "Buy" : "Sell" ,
      offerId: m.restingOrderId ?? undefined,
      taker: m.taker.address,
      inboundToken: m.offerListing.inboundToken,
      outboundToken: m.offerListing.outboundToken,
      price: m.currentVersion?.price.toString() ?? undefined,
      status: m.currentVersion ? this.getStatus(m.currentVersion, m.restingOrderId) : "Open",
      failedReason: m.currentVersion?.failedReason ?? undefined,
      expiryDate: m.currentVersion?.expiryDate.getTime() == new Date(0).getTime() ? undefined : m.currentVersion?.expiryDate,
      takerGot: m.currentVersion?.takerGotNumber.toString(),
      date: m.order.tx.time,
      takerWants: m.takerWantsNumber.toString(),
    }));
  }


  private getStatus( currentVersion: MangroveOrderVersion, restingOrderId: string|null ): "Cancelled" | "Failed" | "Filled" | "Expired" | "Partial Fill" | "Open" | undefined {
      if( currentVersion.cancelled ) {
        return "Cancelled";
      } else if ( currentVersion.failed) {
        return "Failed"
      } else if( currentVersion.filled) {
        return "Filled"
      } else if( currentVersion.expiryDate.getTime() != new Date(0).getTime() && currentVersion.expiryDate.getTime() < new Date().getTime()){
        return "Expired"
      } else if( restingOrderId ){
        return "Open"
      } 
    return "Partial Fill";
  }

  @Query(() => [MangroveOrderFillWithTokens])
  async mangroveOrderFills(
    @Arg("taker") taker: string,
    @Arg("mangrove") mangrove: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderFillWithTokens[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    const prismaMangrove = await ctx.prisma.mangrove.findFirst({ where: { address: mangrove, chainId: chain } })
    const fills = await ctx.prisma.mangroveOrderFill.findMany({ where: { takerId: new AccountId(new ChainId(chain), taker).value, mangroveId: prismaMangrove?.id }, include: { offerListing: { include: { inboundToken: true, outboundToken: true }} }, orderBy: { time: 'desc' }, take, skip });

    return fills.map(m => 
      new MangroveOrderFillWithTokens({
        fillsId: m.fillsId,
        txHash: m.txHash,
        totalFee: m.totalFee,
        mangroveOrderId: m.mangroveOrderId ?? undefined,
        taker: taker,
        inboundToken: m.offerListing.inboundToken,
        outboundToken: m.offerListing.outboundToken,
        price: m.price ?? 0,
        takerGot: m.amount,
        time: m.time,
        type: m.type,
      })
    );
  }


}



@Resolver()
export class KandelHomePageResolver {

  @Query(() => [KandelStrategy])
  async kandelStrategies(
    @Arg("admin") admin: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelStrategy[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let adminId = new AccountId(chainId, admin);
    const kandels = await ctx.prisma.kandel.findMany({ skip, take, where: { currentVersion: { adminId: adminId.value } }, select: { strat: { select: { address: true, offers: { where: { currentVersion: { deleted: false } } } } }, id: true, type: true, baseToken: true, quoteToken: true, reserve: { select: { address: true, TokenBalance: { select: { tokenId: true, currentVersion: { select: { deposit: true, withdrawal: true } } } } } } } })

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
    }).sort((v1, v2) => v1.status == "active" ? 0 : -1);
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
      throw new GraphQLError(`Cannot find kandel with address: ${address} and chain: ${chain}`);
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

  @Query(() => [KandelFill])
  async kandelFills(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelFill[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const fills = await ctx.prisma.takenOffer.findMany({ skip, take, where: { offerVersion: { offer: { makerId: kandelId.value } }, failReason: null }, select: { takerGave: true, takerGot: true, order: { select: { tx: { select: { time: true } }, offerListing: { select: { inboundToken: {}, outboundToken: {} } } } } }, orderBy: { order: { tx: { time: 'desc' } } } });
    return fills.map(v => new KandelFill(v));
  }

  @Query(() => [KandelFailedOffer])
  async kandelFailedOffers(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelFailedOffer[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    const failedOffer = await ctx.prisma.takenOffer.findMany({ skip, take, where: { offerVersion: { offer: { makerId: kandelId.value } }, OR: [{ NOT: { failReason: null } }, { posthookFailed: true }] }, select: { takerGave: true, takerGot: true, order: { select: { tx: { select: { time: true } }, offerListing: { select: { inboundToken: {}, outboundToken: {} } } } } }, orderBy: { order: { tx: { time: 'desc' } } } });
    return failedOffer.map(v => new KandelFailedOffer(v));
  }


  @Query(() => KandelDepositWithdraw)
  async kandelDepositWithdraw(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelDepositWithdraw[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let events = await ctx.prisma.tokenBalanceEvent.findMany({ take, skip, where: { kandelId: kandelId.value, OR: [{ TokenBalanceDepositEvent: { source: TokenBalanceEventSource.KANDEL } }, { TokenBalanceWithdrawalEvent: { source: TokenBalanceEventSource.KANDEL } }] }, include: { TokenBalanceDepositEvent: { select: { value: true, tokenBalanceEvent: { select: { token: true, tokenBalanceVersion: { select: { tx: { select: { time: true } } } } } } } }, TokenBalanceWithdrawalEvent: { select: { value: true, tokenBalanceEvent: { select: { token: true, tokenBalanceVersion: { select: { tx: { select: { time: true } } } } } } } } }, orderBy: [{ tokenBalanceVersion: { tx: { time: 'desc' } } }] })
    return events.map(v => {
      if (v.TokenBalanceDepositEvent) {
        return new KandelDepositWithdraw({ ...v.TokenBalanceDepositEvent, event: "deposit" })
      } else if (v.TokenBalanceWithdrawalEvent) {
        return new KandelDepositWithdraw({ ...v.TokenBalanceWithdrawalEvent, event: "withdraw" });
      }
      throw new GraphQLError("missing deposit/withdrawal event");
    });
  }


  @Query(() => [KandelParameter])
  async kandelParameters(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelParameter[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let paramEvents = await ctx.prisma.kandelEvent.findMany({
      where: { kandelId: kandelId.value, NOT: { KandelVersion: null, OR: [{ KandelAdminEvent: null}, { KandelGasReqEvent: null}, {KandelLengthEvent: null}, {KandelRouterEvent: null}, {gasPriceEvent: null}, {compoundRateEvent: null},{ KandelGeometricParamsEvent: null} ] }  }, include: {
        KandelVersion: { include: { tx: true, prevVersion: { include: { admin: true, configuration: true } } } },
        KandelAdminEvent: { select: { admin: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { admin: { select: { address: true } } } } } } } } } },
        KandelGasReqEvent: { select: { gasReq: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { gasReq: true } } } } } } } } } },
        KandelLengthEvent: { select: { length: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { length: true } } } } } } } } } },
        KandelRouterEvent: { select: { router: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { routerAddress: true } } } } } } } },
        gasPriceEvent: { select: { gasPrice: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { gasPrice: true } } } } } } } } } },
        compoundRateEvent: { select: { compoundRateBase: true, compoundRateQuote: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { compoundRateBase: true, compoundRateQuote: true } } } } } } } } } },
        KandelGeometricParamsEvent: { select: { ratio: true, spread: true, event: { select: { KandelVersion: { select: { tx: { select: { time: true } }, prevVersion: { select: { configuration: { select: { ratio: true, spread: true } } } } } } } } } }
      },
      orderBy: { KandelVersion: { tx: { time: 'desc' } } },
      take, skip
    })

    return paramEvents.map(event => {
      if (event.KandelAdminEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: event.KandelVersion?.prevVersion?.admin.address }) }, type: "admin", value: JSON.stringify(({ value: event.KandelAdminEvent.admin })) })
      } else if (event.KandelGasReqEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: event.KandelVersion?.prevVersion?.configuration.gasReq }) }, type: "gasReq", value: JSON.stringify({ value: event.KandelGasReqEvent.gasReq }) })
      } else if (event.KandelLengthEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: event.KandelVersion?.prevVersion?.configuration.length.toString() }) }, type: "length", value: JSON.stringify({ value: event.KandelLengthEvent.length.toString() }) })
      } else if (event.KandelRouterEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: event.KandelVersion?.prevVersion?.routerAddress }) }, type: "router", value: JSON.stringify({ value: event.KandelRouterEvent.router }) });
      } else if (event.gasPriceEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: event.KandelVersion?.prevVersion?.configuration.gasPrice }) }, type: "gasPrice", value: JSON.stringify({ value: event.gasPriceEvent.gasPrice }) });
      } else if (event.compoundRateEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: { base: event.KandelVersion?.prevVersion?.configuration.compoundRateBase.toString(), quote: event.KandelVersion?.prevVersion?.configuration.compoundRateQuote.toString() } }) }, type: "compoundRateBase", value: JSON.stringify({ value: { base: event.compoundRateEvent.compoundRateBase.toString(), quote: event.compoundRateEvent.compoundRateQuote.toString() } }) })
      } else if (event.KandelGeometricParamsEvent) {
        return new KandelParameter({ event: { tx: { time: event.KandelVersion?.tx.time }, prevVersion: JSON.stringify({ value: { ratio: event.KandelVersion?.prevVersion?.configuration.ratio.toString(), spread: event.KandelVersion?.prevVersion?.configuration.spread.toString() } }) }, type: "ratio", value: JSON.stringify({ value: { ratio: event.KandelGeometricParamsEvent.ratio.toString(), spread: event.KandelGeometricParamsEvent.spread.toString() } }) })
      }
    }).filter(v => v == undefined ? false : true) as KandelParameter[];


  }


  @Query(() => [KandelPopulateRetract])
  async kandelPopulateRetract(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Arg("take") take: number,
    @Arg("skip") skip: number, // TODO:
    @Ctx() ctx: Context
  ): Promise<KandelPopulateRetract[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    let chainId = new ChainId(chain);
    let kandelId = new KandelId(chainId, address);
    let events = await ctx.prisma.kandelEvent.findMany({
      where: { kandelId: kandelId.value, NOT: { KandelVersion: null } }, include: {
        KandelVersion: { include: { tx: true, prevVersion: { include: { admin: true, configuration: true } } } },
        KandelPopulateEvent: { select: { OfferVersion: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } }},
        KandelRetractEvent: { select: { OfferVersion: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } }}
      },
      orderBy: { KandelVersion: { tx: { time: 'desc' } } },
      take, skip
    })

    let populateEvents = await ctx.prisma.kandelPopulateEvent.findMany({ take, skip, where: { event: { kandelId: kandelId.value }, NOT: { event: { KandelVersion: null, OR: [ { KandelPopulateEvent: null}, { KandelRetractEvent: null } ] } } }, select: { OfferVersion: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } } });
    let { inboundToken: tokenA, outboundToken: tokenB } = populateEvents[0].OfferVersion[0].offer.offerListing;
    const retractsAndPopulates = events.map(v => {
      if( v.KandelPopulateEvent || v.KandelRetractEvent){
        const e = ( v.KandelPopulateEvent ? v.KandelPopulateEvent.OfferVersion : v.KandelRetractEvent?.OfferVersion )
        return new KandelPopulateRetract( {
          tokenA,
          tokenAAmount: e?.filter(o => o.offer.offerListing.inboundToken.id === tokenA.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()) ?? "0",
          tokenB,
          tokenBAmount: e?.filter(o => o.offer.offerListing.inboundToken.id === tokenB.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()) ?? "0",
          date: v.KandelVersion?.tx.time,
          event:  v.KandelPopulateEvent ? "populate" : "retract"
        } )
      } 
    });

    return retractsAndPopulates.filter(v => v == undefined ? false : true) as KandelPopulateRetract[];
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
    throw new GraphQLError(
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
    throw new GraphQLError(`Cannot find outbound token from offer '${offerVersion.id}'`);
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
    throw new GraphQLError(`Cannot find inbound token from offer '${offerVersion.id}'`);
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
    throw new GraphQLError(`Cannot find outbound token from order '${order.id}'`);
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
    throw new GraphQLError(`Cannot find inbound token from order '${order.id}'`);
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
    throw new GraphQLError(
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
    throw new GraphQLError(`Cannot find inbound token from takenOffer '${takenOffer.id}'`);
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
    throw new GraphQLError(
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
    throw new GraphQLError(
      `Cannot find inbound token from mangroveOrder '${mangroveOrder.id}'`
    );
  return inboundToken;
}
