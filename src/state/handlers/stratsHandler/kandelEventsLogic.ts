import * as prisma from "@prisma/client";
import BigNumber from "bignumber.js";
import _ from "lodash";
import { AllDbOperations } from "src/state/dbOperations/allDbOperations";
import { KandelOperations } from "src/state/dbOperations/kandelOperations";

import { KandelId, OfferListingId, TokenId } from "src/state/model";


export type KandelParams = {
    compoundRateBase: number,
    compoundRateQuote: number,
    gasPrice: number,
    gasReq: number,
    spread: number,
    ratio: number,
    length: number,
    trigger: string
}

export class KandelEventsLogic {

    //Handle new Kandel

    async handleKandelParamsUpdated(
        undo: boolean,
        kandelId: KandelId,
        params: KandelParams,
        transaction: prisma.Transaction | undefined,
        db: KandelOperations
    ) {
        if (undo) {
            await db.deleteLatestKandelVersion(kandelId);
            return;
        }

        const newConfiguration = await db.createNewKandelConfiguration(params);

        await db.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    congigurationId: newConfiguration.id,
                    trigger: params.trigger
                });
            },
        });
    }


    async handleDepositWithdrawal(
        undo: boolean,
        kandelId: KandelId,
        tokenId: TokenId,
        type: "deposit" | "withdrawal",
        amount: string,
        transaction: prisma.Transaction | undefined,
        db: AllDbOperations) {
        if (undo) {
            await db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }
        // let currentBalance = currency == "base" ? currentVersion.baseBalance : currentVersion.quoteBalance;
        // //TODO: subtract or add to correct balance
        // currentVersion.reserveVersionI
        
        let reserveVersion = await db.kandelOperations.getCurrentReserveVersion(kandelId);
        const status = await db.reserveOperations.getDepositWithdrawalStatusForToken(reserveVersion, tokenId);
        const balance = type==="deposit" ? new BigNumber(status.deposit) :new BigNumber(status.withdrawal)
        const newAmount = new BigNumber(balance).plus(new BigNumber(amount)).toString()

        const newReserveVersion = await db.reserveOperations.addVersionedReserve({
            id: kandelId.reserveId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    withdrawal: type==="deposit" ? status.withdrawal : newAmount,
                    deposit: type==="deposit" ? newAmount : status.deposit,
                })
            }
        })


        await db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    reserveVersionId: newReserveVersion.id,
                    trigger: type
                });
            },
        });
    }

    // Handle rebalance

    // Handle offer taken, 

    // unallocated???


}