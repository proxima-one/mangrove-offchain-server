import * as prisma from "@prisma/client";
import * as mangroveSchema from "@proximaone/stream-schema-mangrove";

import { strict as assert } from "assert";
import {
  AccountId,
  ChainId,
  MangroveId,
  OfferId,
  OfferListingId,
  OrderId,
  TakenOfferId,
  TokenBalanceId,
  TokenId
} from "src/state/model";
import { getBigNumber, getNumber, getPrice } from "src/state/handlers/handlerUtils";
import { AllDbOperations } from "src/state/dbOperations/allDbOperations";
import BigNumber from "bignumber.js";

export class OrderEventLogic {
  db: AllDbOperations;
  orderEventsLogicHelper = new OrderEventLogicHelper();
  constructor(db: AllDbOperations) {
      this.db = db;
  }


  async handleOrderCompleted(
    txRef: any,
    order: mangroveSchema.core.Order,
    offerList: mangroveSchema.core.OfferList,
    id: string,
    undo: boolean,
    mangroveId: MangroveId,
    chainId: ChainId,
    transaction: prisma.Transaction | undefined,
    parentOrderId: OrderId | undefined,
  ) {
    assert(txRef);
    const orderId = new OrderId(mangroveId, offerList, id);

    if (undo) {
      await this.db.orderOperations.undoOrder(mangroveId, offerList, orderId, order);

      return;
    }
    const takerAccountId = new AccountId(chainId, order.taker);
    await this.db.accountOperations.ensureAccount(takerAccountId);

    const offerListingId = new OfferListingId(mangroveId, offerList);

    const tokens = await this.db.offerListOperations.getOfferListTokens({
      id: offerListingId,
    });
    const prismaOrder = this.orderEventsLogicHelper.createOrder(mangroveId, offerListingId, tokens, order, takerAccountId, orderId, transaction!.id, parentOrderId);
    const takenOffersWithEvents = await Promise.all(order.takenOffers.map((value) => this.orderEventsLogicHelper.mapTakenOffer(orderId, value, tokens, (o) => this.db.offerOperations.getOffer(o))));
    const takenOffers: Omit<prisma.TakenOffer, "orderId">[] = takenOffersWithEvents.map(value => value.takenOffer);

    await this.db.orderOperations.createOrder(orderId, prismaOrder, takenOffers);

    for (let i = 0; i < takenOffersWithEvents.length; i++) {
      const { takenOffer, takenOfferEvent } = takenOffersWithEvents[i];
      const offer = await this.db.offerOperations.getOffer(new OfferId(mangroveId, offerList, takenOfferEvent.id));
      assert(offer);
      const kandel = await this.db.kandelOperations.getKandelFromOffer(offer)
      if (!kandel) {
        continue
      }
      const { inboundToken, outboundToken } = await this.db.offerListOperations.getOfferListTokens({ id: offerListingId });
      const reserveAddress = await this.db.kandelOperations.getReserveAddress({ kandel })
      const reserveId = new AccountId(chainId, reserveAddress);
      const takenOfferId = new TakenOfferId(orderId, takenOfferEvent.id);
        
      await this.addNewInboundBalanceWithEvent(chainId, reserveId, inboundToken, transaction!.id, kandel, takenOfferId, takenOffer)
      await this.addNewOutboundBalanceWithEvent(chainId, reserveId, outboundToken, transaction!.id, kandel, takenOfferId, takenOffer)

    }

  }

  async addNewInboundBalanceWithEvent(chainId:ChainId, reserveId:AccountId, inboundToken:prisma.Token, txId:string, kandel:prisma.Kandel, takenOfferId:TakenOfferId, takenOffer:Omit<prisma.TakenOffer, "orderId">) {
    const inboundTokenId = new TokenId(chainId, inboundToken.address);
    const inboundTokenBalanceId = new TokenBalanceId({ accountId: reserveId, tokenId: inboundTokenId })
    const { updatedOrNewTokenBalance, newVersion:newInboundBalance } = await this.db.tokenBalanceOperations.addTokenBalanceVersion({
      tokenBalanceId: inboundTokenBalanceId,
      txId: txId,
      updateFunc: (tokenBalanceVersion) => {
        tokenBalanceVersion.earned = new BigNumber(takenOffer.takerGot).plus(tokenBalanceVersion.earned).toString();
        tokenBalanceVersion.balance = new BigNumber(takenOffer.takerGot).plus(tokenBalanceVersion.balance).toString();
      }
    })
    await this. db.tokenBalanceOperations.createTokenBalanceEvent(reserveId, kandel, inboundTokenId, newInboundBalance, takenOfferId)
  }

  async addNewOutboundBalanceWithEvent(chainId:ChainId, reserveId:AccountId, outboundToken:prisma.Token, txId:string, kandel:prisma.Kandel, takenOfferId:TakenOfferId, takenOffer:Omit<prisma.TakenOffer, "orderId">) {
    const outboundTokenId = new TokenId(chainId, outboundToken.address);
    const outboundTokenBalanceId = new TokenBalanceId({ accountId: reserveId, tokenId: outboundTokenId })
    const { updatedOrNewTokenBalance, newVersion:newOutboundBalance } = await this.db.tokenBalanceOperations.addTokenBalanceVersion({
      tokenBalanceId: outboundTokenBalanceId,
      txId: txId,
      updateFunc: (tokenBalanceVersion) => {
        tokenBalanceVersion.spent = new BigNumber(takenOffer.takerGave).plus(tokenBalanceVersion.earned).toString();
        tokenBalanceVersion.balance = new BigNumber(takenOffer.takerGave).minus(tokenBalanceVersion.balance).toString();
      }
    })
    await this. db.tokenBalanceOperations.createTokenBalanceEvent(reserveId, kandel, outboundTokenId, newOutboundBalance, takenOfferId)
  }
}
export class OrderEventLogicHelper {

  createOrder(
    mangroveId: MangroveId,
    offerListingId: OfferListingId,
    tokens: { inboundToken: { decimals: number }, outboundToken: { decimals: number } },
    order: Omit<mangroveSchema.core.Order, "takenOffers" | "taker">,
    takerId: AccountId,
    orderId: OrderId,
    txId: string,
    parentOrderId?: OrderId,
  ) {

    const takerGotBigNumber = getBigNumber({
      value: order.takerGot,
      token: tokens.outboundToken,
    });
    const takerGaveBigNumber = getBigNumber({
      value: order.takerGave,
      token: tokens.inboundToken,
    });

    const prismaOrder: prisma.Order = {
      id: orderId.value,
      txId: txId,
      proximaId: orderId.proximaId,
      parentOrderId: parentOrderId?.value ?? null,
      offerListingId: offerListingId.value,
      mangroveId: mangroveId.value,
      takerId: takerId.value,
      // takerWants: order.takerWants,
      // takerWantsNumber: getNumber({
      //   value: order.takerWants,
      //   token: outboundToken,
      // }),
      // takerGives: order.takerGives,
      // takerGivesNumber: getNumber({
      //   value: order.takerGives,
      //   token: inboundToken,
      // }),
      takerGot: order.takerGot,
      takerGotNumber: takerGotBigNumber.toNumber(),
      takerGave: order.takerGave,
      takerGaveNumber: takerGaveBigNumber.toNumber(),
      takerPaidPrice: getPrice({ over: takerGaveBigNumber, under: takerGotBigNumber }),
      makerPaidPrice: getPrice({ over: takerGotBigNumber, under: takerGaveBigNumber }),
      bounty: order.penalty,
      bountyNumber: getNumber({ value: order.penalty, decimals: 18 }),
      totalFee: order.feePaid.length == 0 ? "0" : order.feePaid,
      totalFeeNumber: order.feePaid.length == 0 ? 0 : getNumber({
        value: order.feePaid,
        token: tokens.outboundToken,
      }),
    }

    return prismaOrder;
  }

  public async mapTakenOffer(
    orderId: OrderId,
    takenOfferEvent: mangroveSchema.core.TakenOffer,
    tokens: { inboundToken: { decimals: number }, outboundToken: { decimals: number } },
    getOffer: (offerId: OfferId) => Promise<{ currentVersionId: string } | null>,
  ) {
    const takerGotBigNumber = getBigNumber({ value: takenOfferEvent.takerWants, token: tokens.outboundToken });
    const takerGaveBigNumber = getBigNumber({ value: takenOfferEvent.takerGives, token: tokens.inboundToken });
    const offerId = new OfferId(orderId.mangroveId, orderId.offerListKey, takenOfferEvent.id);
    const offer = await getOffer(offerId);

    assert(offer);

    const takenOffer: Omit<prisma.TakenOffer, "orderId"> = {
      id: new TakenOfferId(orderId, takenOfferEvent.id).value,
      offerVersionId: offer.currentVersionId,
      takerGot: takenOfferEvent.takerWants,
      takerGotNumber: takerGotBigNumber.toNumber(),
      takerGave: takenOfferEvent.takerGives,
      takerGaveNumber: takerGaveBigNumber.toNumber(),
      takerPaidPrice: getPrice({ over: takerGaveBigNumber, under: takerGotBigNumber }),
      makerPaidPrice: getPrice({ over: takerGotBigNumber, under: takerGaveBigNumber }),
      failReason: takenOfferEvent.failReason ?? null,
      posthookData: takenOfferEvent.posthookData ?? null,
      posthookFailed: takenOfferEvent.posthookFailed ?? false,
    };

    return { takenOffer, takenOfferEvent };
  }




}
