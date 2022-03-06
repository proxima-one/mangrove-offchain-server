import * as prisma from "@prisma/client";
import * as _ from "lodash";
import {
  AccountId,
  DomainEvent,
  eventMatcher,
  MakerBalanceId,
  OfferId,
  OfferListId,
  OrderId,
  TakenOfferId,
  TakerApprovalId,
} from "./model";
import BigNumber from "bignumber.js";

export class EventHandler {
  public constructor(
    private readonly prisma: prisma.PrismaClient,
    private readonly streamId: string
  ) {}

  public async getStreamState() {
    const streamConsumer = await this.prisma.streams.findFirst({
      where: { id: this.streamId },
    });
    return streamConsumer?.state;
  }

  public async handle(events: DomainEvent[]): Promise<void> {
    if (events.length == 0) return;

    await this.prisma.$transaction(
      async (tx) => {
        const db = new DbOperations(tx);
        for (const { payload, undo, timestamp, state } of events) {
          const mangroveId = payload.mangroveId;
          await eventMatcher({
            OfferRetracted: async (e) => {
              await db.deleteOffer(
                new OfferId(mangroveId, e.offerList, e.offerId)
              );
            },
            OfferWritten: async ({ offer, maker, offerList }) => {
              const accountId = new AccountId(maker);
              await db.ensureAccount(accountId);

              const offerId = new OfferId(mangroveId, offerList, offer.id);
              const prevOfferId =
                offer.prev == 0
                  ? null
                  : new OfferId(mangroveId, offerList, offer.prev);

              await db.updateOffer({
                id: offerId.value,
                offerListId: new OfferListId(mangroveId, offerList).value,
                mangroveId: mangroveId,
                gasprice: offer.gasprice,
                gives: offer.gives,
                wants: offer.wants,
                gasreq: offer.gasreq,
                live: new BigNumber(offer.gives).isPositive(),
                deprovisioned: offer.gasprice == 0,
                prevOfferId: prevOfferId ? prevOfferId.value : null,
                makerId: maker,
              });
            },
            OfferListParamsUpdated: async ({ offerList, params }) => {
              const id = new OfferListId(mangroveId, offerList);
              await db.updateOfferList(id, (model) => {
                _.merge(model, params);
              });
            },
            MangroveParamsUpdated: async ({ params }) => {
              await db.updateMangrove(mangroveId, (model) => {
                _.merge(model, params);
              });
            },
            MakerBalanceUpdated: async ({ maker, amountChange }) => {
              let amount = new BigNumber(amountChange);
              if (undo) amount = amount.times(-1);

              const makerBalanceId = new MakerBalanceId(mangroveId, maker);

              await db.updateMakerBalance(makerBalanceId, (model) => {
                model.balance = new BigNumber(model.balance)
                  .plus(amount)
                  .toFixed();
              });
            },
            TakerApprovalUpdated: async ({
              offerList,
              amount,
              spender,
              owner,
            }) => {
              const takerApprovalId = new TakerApprovalId(
                mangroveId,
                offerList,
                owner,
                spender
              );
              const accountId = new AccountId(owner);

              await db.ensureAccount(accountId);
              await db.updateTakerApproval(takerApprovalId, (model) => {
                model.value = amount;
              });
            },
            OrderCompleted: async ({ id, order, offerList }) => {
              // create order and taken offers
              const orderId = new OrderId(mangroveId, offerList, id);
              // taken offer is not an aggregate

              const takerAccountId = new AccountId(order.taker);
              await db.ensureAccount(takerAccountId);
              await tx.order.create({
                data: {
                  id: orderId.value,
                  offerListId: new OfferListId(mangroveId, offerList).value,
                  mangroveId: mangroveId,
                  takerId: takerAccountId.value,
                  takerGot: order.takerGot,
                  takerGave: order.takerGave,
                  penalty: order.penalty,
                  takenOffers: {
                    create: order.takenOffers.map((o) => {
                      return {
                        id: new TakenOfferId(orderId, o.id).value,
                        takerWants: o.takerWants,
                        takerGives: o.takerGives,
                        failReason: o.failReason,
                        posthookFailed: o.posthookFailed == true,
                      };
                    }),
                  },
                },
              });
            },
          })(payload);
        }

        const streamState = events[events.length - 1].state;
        await tx.streams.upsert({
          where: { id: this.streamId },
          create: { id: this.streamId, state: streamState },
          update: { state: streamState },
        });
      },
      { timeout: 30000 }
    );
  }
}

class DbOperations {
  public constructor(private readonly tx: PrismaTx) {}

  public async ensureAccount(id: AccountId): Promise<prisma.Account> {
    let account = await this.tx.account.findUnique({ where: { id: id.value } });
    if (account == undefined) {
      account = {
        id: id.value,
        address: id.address,
      };
      await this.tx.account.create({ data: account });
    }
    return account;
  }

  public async deleteOffer(id: OfferId) {
    await this.tx.offer.deleteMany({ where: { id: id.value } });
  }

  public async updateOffer(offer: prisma.Offer) {
    await this.tx.offer.upsert(toUpsert(offer));
  }

  public async updateOfferList(
    id: OfferListId,
    updateFunc: (model: prisma.OfferList) => void
  ) {
    const offerList = (await this.tx.offerList.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      inboundToken: id.offerListKey.inboundToken,
      outboundToken: id.offerListKey.outboundToken,
      active: null,
      density: null,
      gasbase: null,
      fee: null,
    };

    updateFunc(offerList);

    await this.tx.offerList.upsert(toUpsert(offerList));
    return offerList;
  }

  public async updateMangrove(
    id: string,
    updateFunc: (model: prisma.Mangrove) => void
  ) {
    const mangrove = (await this.tx.mangrove.findUnique({
      where: { id: id },
    })) ?? {
      id: id,
      gasprice: null,
      gasmax: null,
      governance: null,
      dead: null,
      monitor: null,
      notify: null,
      useOracle: null,
      vault: null,
    };

    updateFunc(mangrove);

    await this.tx.mangrove.upsert(toUpsert(mangrove));
    return mangrove;
  }

  public async updateMakerBalance(
    id: MakerBalanceId,
    updateFunc: (model: prisma.MakerBalance) => void
  ) {
    const makerBalance = (await this.tx.makerBalance.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      balance: "0",
      makerId: new AccountId(id.address).value,
    };

    updateFunc(makerBalance);

    await this.tx.makerBalance.upsert(toUpsert(makerBalance));
  }

  public async updateTakerApproval(
    id: TakerApprovalId,
    updateFunc: (model: prisma.TakerApproval) => void
  ) {
    const takerApproval = (await this.tx.takerApproval.findUnique({
      where: { id: id.value },
    })) ?? {
      id: id.value,
      mangroveId: id.mangroveId,
      ownerId: new AccountId(id.ownerAddress).value,
      spenderId: new AccountId(id.spenderAddress).value,
      offerListId: new OfferListId(id.mangroveId, id.offerListKey).value,
      value: "0",
    };

    updateFunc(takerApproval);

    await this.tx.takerApproval.upsert(toUpsert(takerApproval));
  }
}

type PrismaTx = Omit<
  prisma.PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use"
>;

function toUpsert<T extends { id: string | number }>(entity: T): Upsert<T> {
  return {
    where: { id: entity.id },
    create: entity,
    update: entity,
  };
}

interface Upsert<T> {
  where: { id: any };
  create: T;
  update: T;
}
