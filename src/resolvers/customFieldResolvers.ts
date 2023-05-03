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
import { PrismaClient } from "@prisma/client";
import { Arg, Ctx, FieldResolver, Query, Resolver, Root } from "type-graphql";

// At most re-fetch once per 1000 ms for each token
import BigNumber from "bignumber.js";
import { MemoryCache, fetchBuilder } from "node-fetch-cache";
import { OfferListingUtils } from "src/state/dbOperations/offerListingUtils";
import { AccountId, ChainId, KandelId, MangroveId, OfferListingId } from "src/state/model";
import { KandelDepositWithdraw, KandelFailedOffer, KandelFill, KandelOffer, KandelParameter, KandelPopulateRetract, KandelStrategy } from "./kandelObjects";
import { MangroveOrderFillWithTokens, MangroveOrderOpenOrder } from "./mangroveOrderObjects";
import { GraphQLError } from "graphql";
import { KandelReturnUtils } from "src/utils/KandelReturnUtils";
const fetch = fetchBuilder.withCache(new MemoryCache({ ttl: 1000 }));
async function fetchTokenPriceIn(token: Token, inSymbol: string) {
  return (await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${token.symbol}&tsyms=${inSymbol}`
  )
    .then((response: any) => response.json())
    .then((json: any) => json[inSymbol])
    .catch(() => undefined)) as number;
}

type Context = {
  prisma: PrismaClient;
};

const kandelReturnUtils = new KandelReturnUtils();

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
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const offers = await ctx.prisma.offer.findMany({ take, skip, 
      where: { 
        makerId: kandelId.value 
      }, 
      include: { 
        kandelOfferIndexes: true, 
        currentVersion: true, 
        offerListing: { 
          select: { 
            inboundToken: true, 
            outboundToken: true 
          } 
        } 
      } 
    })
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
    @Arg("token1") token1: string,
    @Arg("token2") token2: string,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderOpenOrder[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    const mangroveOrders = await ctx.prisma.mangroveOrder.findMany({
      take, skip,
      where: {
        mangrove: { address: { contains: mangrove.toLowerCase(), mode: 'insensitive' }, chainId: chain },
        taker: { address: { contains: taker.toLowerCase(), mode: 'insensitive' } },
        order: {
          offerListing: {
            inboundToken: {
              OR: [{
                address: {
                  contains: token1.toLowerCase(),
                  mode: 'insensitive'
                }
                
              },
              {
                address:  {
                  contains: token2.toLowerCase(),
                  mode: 'insensitive'
                }
              }],
            },
            outboundToken: {
              OR: [{
                address:  {
                  contains: token1.toLowerCase(),
                  mode: 'insensitive'
                }
              },
              {
                address:  {
                  contains: token2.toLowerCase(),
                  mode: 'insensitive'
                }
              }]
            }
          }
        }
      },
      include: {
        currentVersion: true,
        order: { select: { tx: true } },
        taker: true,
        offerListing: { include: { inboundToken: true, outboundToken: true } }
      }, orderBy: [
        { currentVersion: { cancelled: 'asc' } },
        { currentVersion: { filled: 'asc' } },
        { currentVersion: { expiryDate: 'desc' } }]
    })
    return mangroveOrders.map(m => new MangroveOrderOpenOrder({
      mangroveOrderId: m.id,
      isBuy: m.fillWants ? true : false,
      isOpen: m.currentVersion ? this.getStatus(m.currentVersion, m.restingOrderId) == "Open" : true,
      offerId: m.restingOrderId ?? undefined,
      taker: m.taker.address,
      inboundToken: m.offerListing.inboundToken,
      outboundToken: m.offerListing.outboundToken,
      price: m.currentVersion?.price ?? undefined,
      status: m.currentVersion ? this.getStatus(m.currentVersion, m.restingOrderId) : "Open",
      isFailed: m.currentVersion?.failed ?? false,
      isFilled: m.currentVersion?.filled ?? false,
      failedReason: m.currentVersion?.failedReason ?? undefined,
      expiryDate: m.currentVersion?.expiryDate.getTime() == new Date(0).getTime() ? undefined : m.currentVersion?.expiryDate,
      takerGot: m.currentVersion?.takerGotNumber,
      date: m.order.tx.time,
      takerWants: m.takerWantsNumber,
    }));
  }


  private getStatus(currentVersion: MangroveOrderVersion, restingOrderId: string | null): "Cancelled" | "Failed" | "Filled" | "Partial Fill" | "Open" | undefined {
    if (currentVersion.cancelled) {
      return "Cancelled";
    } else if (currentVersion.failed) {
      return "Failed"
    } else if (currentVersion.filled) {
      return "Filled"
    } else if (currentVersion.expiryDate.getTime() != new Date(0).getTime() && currentVersion.expiryDate.getTime() < new Date().getTime()) {
      return "Cancelled"
    } else if (restingOrderId) {
      return "Open"
    }
    return "Partial Fill";
  }

  @Query(() => [MangroveOrderFillWithTokens])
  async mangroveOrderFills(
    @Arg("taker") taker: string,
    @Arg("mangrove") mangrove: string,
    @Arg("chain") chain: number,
    @Arg("token1") token1: string,
    @Arg("token2") token2: string,
    @Arg("take") take: number,
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<MangroveOrderFillWithTokens[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    const prismaMangrove = await ctx.prisma.mangrove.findFirst({ where: { address: mangrove, chainId: chain } })
    const fills = await ctx.prisma.mangroveOrderFill.findMany({
      where: {
        takerId: { 
          contains: new AccountId(new ChainId(chain), taker).value.toLowerCase(),
          mode: 'insensitive'
        },
        mangroveId: prismaMangrove?.id,
          offerListing: {
            inboundToken: {
              OR: [{
                address: {
                  contains: token1.toLowerCase(),
                  mode: 'insensitive'
                }
                
              },
              {
                address:  {
                  contains: token2.toLowerCase(),
                  mode: 'insensitive'
                }
              }],
            },
            outboundToken: {
              OR: [{
                address:  {
                  contains: token1.toLowerCase(),
                  mode: 'insensitive'
                }
              },
              {
                address:  {
                  contains: token2.toLowerCase(),
                  mode: 'insensitive'
                }
              }]
            }
          }
        
      },
      include: {
        offerListing: { include: { inboundToken: true, outboundToken: true } }
      },
      orderBy: { time: 'desc' },
      take, skip
    });

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
        totalPaid: m.amount + m.totalFee
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
    const chainId = new ChainId(chain);
    const adminId = new AccountId(chainId, admin);
    const kandels = await ctx.prisma.kandel.findMany({ skip, take, 
      where: { 
        currentVersion: { adminId: adminId.value }
       }, 
       select: { 
        strat: { 
          select: { 
            address: true, 
            offers: { where: { currentVersion: { deleted: false } } } 
          } 
        }, 
        id: true, 
        type: true, 
        baseToken: true, 
        quoteToken: true, 
        reserve: { 
          select: { 
            address: true, 
            TokenBalance: { 
              select: { 
                tokenId: true, 
                currentVersion: { 
                  select: { 
                    deposit: true, 
                    withdrawal: true 
                  } 
                }
               } 
              } 
            } 
          } 
        } 
      })

    return (await Promise.all(kandels.map(async kandel => {
      return new KandelStrategy({
        name: kandel.type,
        address: kandel.strat.address,
        reserve: kandel.reserve.address,
        tokenA: kandel.baseToken,
        tokenB: kandel.quoteToken,
        return: "-", // await kandelReturnUtils.getKandelReturn(new KandelId(chainId, kandel.strat.address), ctx.prisma, (token) => fetchTokenPriceIn(token, 'USDC')),
        status: kandel.strat.offers.length > 0 ? "active" : "closed"
      });
    }))).sort((v1, v2) => v1.status == "active" ? 0 : -1);
  }

  @Query(() => KandelStrategy)
  async kandelStrategy(
    @Arg("address") address: string,
    @Arg("chain") chain: number,
    @Ctx() ctx: Context
  ): Promise<KandelStrategy> {
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const kandel = await ctx.prisma.kandel.findUnique({ 
      where: { 
        id: kandelId.value 
      }, 
      select: { 
        strat: { 
          select: { 
            address: true, 
            offers: { 
              where: { 
                currentVersion: { 
                  deleted: false 
                } 
              } 
            } 
          } 
        }, 
        id: true, 
        type: true, 
        baseToken: true, 
        quoteToken: true, 
        reserve: { 
          select: { 
            address: true, 
            TokenBalance: { 
              select: { 
                tokenId: true, 
                currentVersion: { 
                  select: { 
                    deposit: true, 
                    withdrawal: true 
                  } 
                } 
              } 
            } 
          } 
        } 
      } 
    })
    if (!kandel) {
      throw new GraphQLError(`Cannot find kandel with address: ${address} and chain: ${chain}`);
    }
    return new KandelStrategy({
      name: kandel.type,
      address: kandel.strat.address,
      reserve: kandel.reserve.address,
      tokenA: kandel.baseToken,
      tokenB: kandel.quoteToken,
      return:  await kandelReturnUtils.getKandelReturn(new KandelId(chainId, kandel.strat.address), ctx.prisma, (token) => fetchTokenPriceIn(token, 'USDC')),
      status: kandel.strat.offers.length > 0 ? "active" : "closed"
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
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const fills = await ctx.prisma.takenOffer.findMany({ skip, take, 
      where: { 
        offerVersion: { 
          offer: { 
            makerId: kandelId.value 
          } 
        }, 
        failReason: null 
      }, 
      select: { 
        takerGave: true, 
        takerGot: true, 
        order: { 
          select: { 
            tx: { 
              select: { 
                time: true 
              } 
            }, 
            offerListing: { 
              select: { 
                inboundToken: true, 
                outboundToken: true 
              } 
            } 
          } 
        } 
      }, 
      orderBy: { 
        order: { 
          tx: { 
            time: 'desc' 
          } 
        } 
      } 
    });
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
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const failedOffer = await ctx.prisma.takenOffer.findMany({ skip, take, 
      where: { 
        offerVersion: { 
          offer: { 
            makerId: kandelId.value 
          } 
        }, 
        OR: [
          { NOT: { failReason: null } }, { posthookFailed: true }] 
        }, 
        select: { 
          takerGave: true, 
          takerGot: true, 
          order: { 
            select: { 
              tx: { 
                select: { 
                  time: true 
                } 
              }, 
              offerListing: { 
                select: { 
                  inboundToken: true, 
                  outboundToken: true 
                } 
              } 
            } 
          } 
        }, 
        orderBy: { order: { tx: { time: 'desc' } } } });
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
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const events = await ctx.prisma.tokenBalanceEvent.findMany({ take, skip, 
      where: { 
        OR: [
          { TokenBalanceDepositEvent: { source: kandelId.value } }, 
          { TokenBalanceWithdrawalEvent: { source: kandelId.value } }
        ] 
      }, 
      include: { 
        TokenBalanceDepositEvent: { 
          select: { 
            value: true, 
            tokenBalanceEvent: {
              select: { 
                token: true, 
                tokenBalanceVersion: { 
                  select: { 
                    tx: { 
                      select: { 
                        time: true 
                      } 
                    } 
                  } 
                } 
              } 
            } 
          } 
        }, 
        TokenBalanceWithdrawalEvent: { 
          select: { 
            value: true, 
            tokenBalanceEvent: { 
              select: { 
                token: true, 
                tokenBalanceVersion: { 
                  select: { 
                    tx: { 
                      select: { 
                        time: true 
                      } 
                    } 
                  } 
                } 
              } 
            } 
          } 
        } 
      }, 
      orderBy: { 
        tokenBalanceVersion: { 
          tx: { 
            time: 'desc' 
          } 
        } 
      } 
    })
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
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const paramEvents = await ctx.prisma.kandelEvent.findMany({
      where: { kandelId: kandelId.value, NOT: { KandelVersion: null, OR: [{ KandelAdminEvent: null }, { KandelGasReqEvent: null }, { KandelLengthEvent: null }, { KandelRouterEvent: null }, { gasPriceEvent: null }, { compoundRateEvent: null }, { KandelGeometricParamsEvent: null }] } }, 
      include: {
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
    @Arg("skip") skip: number,
    @Ctx() ctx: Context
  ): Promise<KandelPopulateRetract[]> {
    if (take > 100) {
      throw new GraphQLError(`Cannot take more than 100, take:${take}`)
    }
    const chainId = new ChainId(chain);
    const kandelId = new KandelId(chainId, address);
    const events = await ctx.prisma.kandelEvent.findMany({
      where: { kandelId: kandelId.value, NOT: [{ KandelVersion: null }, { OR: [{ KandelPopulateEvent: null }, { KandelRetractEvent: null }] }] }, 
      include: {
        KandelVersion: { include: { tx: true, prevVersion: { include: { admin: true, configuration: true } } } },
        KandelPopulateEvent: { select: { KandelOfferUpdate: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } } },
        KandelRetractEvent: { select: { KandelOfferUpdate: { select: { offer: { select: { offerListing: { select: { outboundToken: true, inboundToken: true } } } }, gives: true } }, event: { select: { KandelVersion: { select: { tx: { select: { time: true } } } } } } } }
      },
      orderBy: { KandelVersion: { tx: { time: 'desc' } } },
      take, skip
    })

    const { inboundToken: tokenA, outboundToken: tokenB } = events[0].KandelPopulateEvent!.KandelOfferUpdate[0].offer.offerListing;
    const retractsAndPopulates = events.map(v => {
      if (v.KandelPopulateEvent || v.KandelRetractEvent) {
        const e = (v.KandelPopulateEvent ? v.KandelPopulateEvent.KandelOfferUpdate : v.KandelRetractEvent?.KandelOfferUpdate)
        return new KandelPopulateRetract({
          tokenA,
          tokenAAmount: e?.filter(o => o.offer.offerListing.inboundToken.id === tokenA.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()) ?? "0",
          tokenB,
          tokenBAmount: e?.filter(o => o.offer.offerListing.inboundToken.id === tokenB.id).map(o => o.gives).reduce((result, current) => new BigNumber(result).plus(new BigNumber(current)).toString()) ?? "0",
          date: v.KandelVersion?.tx.time,
          event: v.KandelPopulateEvent ? "populate" : "retract"
        })
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
