import * as prisma from "@prisma/client";
import BigNumber from "bignumber.js";
import _ from "lodash";
import { AllDbOperations } from "src/state/dbOperations/allDbOperations";
import { KandelOperations } from "src/state/dbOperations/kandelOperations";

import { AccountId, ChainId, KandelId, MangroveId, OfferId, OfferListingId, ReserveId, StratId, TokenId } from "src/state/model";
import { Credit, Debit, KandelCreated, KandelParamsUpdated, OfferIndex, Populate } from "src/temp/kandelEvents";


export type KandelParams = {
    compoundRateBase: string,
    compoundRateQuote: string,
    gasPrice: string,
    gasReq: string,
    spread: string,
    ratio: string,
    length: number,
    trigger: string,
    admin: string,
    router: string
}

export class KandelEventsLogic {

    async handleKandelCreated(
        undo: boolean,
        chainId: ChainId,
        event: KandelCreated,
        transaction: prisma.Transaction | undefined,
        db: AllDbOperations) {
        const mangroveId =new MangroveId(chainId, event.mangroveId);

        const reserveId = new ReserveId(mangroveId.chainId, event.reserve);
        const kandelId = new KandelId(chainId, event.address);
        if (undo) {
            await db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }
        const newConfiguration = await db.kandelOperations.createNewKandelConfiguration(event.kandelParams);
        const reserveVersionId = await db.reserveOperations.getOrCreateCurrentReserveVersion(reserveId);
        const adminId = new AccountId(mangroveId.chainId, event.kandelParams.admin).value;
        const baseToken = new TokenId(mangroveId.chainId, event.base);
        const quoteToken = new TokenId(mangroveId.chainId, event.quote);

        await db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    adminId: adminId,
                    reserveVersionId: reserveVersionId,
                    routerAddress: event.kandelParams.router,
                    congigurationId: newConfiguration.id,
                    trigger: event.kandelType
                });
            },
            constParams: {
                reserveId: reserveId,
                mangroveId: mangroveId,
                base: baseToken,
                quote: quoteToken,
                type: event.kandelType

            }
        })

    }

    async handleKandelParamsUpdated(
        undo: boolean,
        kandelId: KandelId,
        event: KandelParamsUpdated,
        transaction: prisma.Transaction | undefined,
        db: KandelOperations
    ) {

        if (undo) {
            await db.deleteLatestKandelVersion(kandelId);
            return;
        }

        const newConfiguration = await db.createNewKandelConfiguration(event.kandelParams);

        await db.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    congigurationId: newConfiguration.id,
                    trigger: event.kandelParams.trigger
                });
            },
        });
    }


    async handleDepositWithdrawal(
        undo: boolean,
        kandelId: KandelId,
        event: Debit | Credit,
        transaction: prisma.Transaction | undefined,
        db: AllDbOperations) {
        if (undo) {
            await db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }

        const tokenId = new TokenId(kandelId.chainId, event.token);

        let reserveVersion = await db.kandelOperations.getCurrentReserveVersion(kandelId);
        const status = await db.reserveOperations.getDepositWithdrawalStatusForToken(reserveVersion, tokenId);
        const balance = event.type == "Credit" ? new BigNumber(status.deposit) : new BigNumber(status.withdrawal)
        const newAmount = new BigNumber(balance).plus(new BigNumber(event.amount)).toString()

        const reserveAddress = await db.kandelOperations.getReserveAddress(kandelId);
        

        const newReserveVersion = await db.reserveOperations.addVersionedReserve({
            id: new ReserveId(kandelId.chainId, reserveAddress ),
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    withdrawal: event.type == "Debit" ? newAmount : status.withdrawal,
                    deposit: event.type == "Credit" ? newAmount : status.deposit,
                })
            }
        })


        await db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    reserveVersionId: newReserveVersion.id,
                    trigger: event.type
                });
            },
        });
    }

    async handlePopulate(
        undo: boolean,
        kandelId: KandelId,
        event: Populate,
        transaction: prisma.Transaction | undefined,
        db: KandelOperations
    ) {
        if (undo) {
            await db.deleteLatestKandelVersion(kandelId);
            return;
        }
        await db.addVersionedKandel({ 
            id:kandelId, 
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    trigger: event.type
                });
            },
         } )
    }

    async handleOfferIndex(
        undo: boolean,
        kandelId: KandelId,
        event: OfferIndex,
        transaction: prisma.Transaction | undefined,
        db: KandelOperations
        ) {
        const kandel = await db.getKandel(kandelId);
        const base = await db.getToken(kandelId, "baseId");
        const quote = await db.getToken(kandelId, "quoteId");
        const offerId = new OfferId(new MangroveId(kandelId.chainId, kandel.mangroveId), {
            outboundToken: event.ba === "ask" ? base.address : quote.address,
            inboundToken: event.ba === "ask" ? quote.address : base.address,
          }, event.offerId);
        
          if (undo) {
            await db.deleteOfferIndex(kandelId, offerId, event.ba);
            return;
        }
        
        
        await db.createOfferIndex(kandelId, transaction!.id, offerId, event.index, event.ba);

    }




}