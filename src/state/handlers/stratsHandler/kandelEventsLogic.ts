import * as prisma from "@prisma/client";
import BigNumber from "bignumber.js";
import _, { over } from "lodash";
import { AllDbOperations } from "src/state/dbOperations/allDbOperations";

import { AccountId, ChainId, KandelId, MangroveId, OfferId, TokenBalanceId, TokenId } from "src/state/model";
import { OfferIndex, Populate } from "src/temp/kandelEvents";
import { Credit, Debit, NewKandel, NewAaveKandel, SetParams } from "@proximaone/stream-schema-mangrove/dist/kandel"
export class KandelEventsLogic {

    db: AllDbOperations;
    constructor(db: AllDbOperations) {
        this.db = db;
    }

    async handleKandelCreated(
        undo: boolean,
        chainId: ChainId,
        event: (NewKandel | NewAaveKandel) & {mangroveId: string, admin:string, router:string, setParams:SetParams },
        transaction: prisma.Transaction | undefined) {
        const mangroveId = new MangroveId(chainId, event.mangroveId);

        const reserveId = new AccountId(mangroveId.chainId, event.type =="NewAaveKandel" ? event.reserveId : event.kandel);
        const kandelId = new KandelId(chainId, event.type =="NewAaveKandel" ? event.aaveKandel : event.kandel);
        if (undo) {
            await this.db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }
        const newConfiguration = await this.db.kandelOperations.createNewKandelConfiguration(this.mapSetParamsToKandelConfiguration(event.setParams));
        const adminId = new AccountId(mangroveId.chainId, event.admin).value;
        const baseToken = new TokenId(mangroveId.chainId, event.base);
        const quoteToken = new TokenId(mangroveId.chainId, event.quote);

        await this.db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    adminId: adminId,
                    routerAddress: event.router,
                    congigurationId: newConfiguration.id,
                    trigger: event.type
                });
            },
            constParams: {
                reserveId: reserveId,
                mangroveId: mangroveId,
                base: baseToken,
                quote: quoteToken,
                type: event.type

            }
        })

    }

    mapSetParamsToKandelConfiguration(setParams:SetParams) {
        let t = {
            compoundRateBase: setParams.compoundRates ? setParams.compoundRates.base : 0,
            compoundRateQuote: setParams.compoundRates ? setParams.compoundRates.quote : 0,
            gasPrice: setParams.gasPrice ?? "",
            gasReq: setParams.gasPrice ?? "",
            spread: setParams.geometric ? setParams.geometric.spread : 0,
            ratio: setParams.geometric ? setParams.geometric.ratio : 0,
            length: setParams.length ?? 0,
        }
        return t;
    }

    async handleKandelParamsUpdated(
        undo: boolean,
        kandelId: KandelId,
        event: SetParams,
        transaction: prisma.Transaction | undefined
    ) {

        if (undo) {
            await this.db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }
        const currentConfig = await this.db.kandelOperations.getCurrentKandelConfigration(kandelId);
        const currentVersion = await this.db.kandelOperations.getCurrentKandelVersion(kandelId);

        const kandelConfiguration = this.getKandelConfigWithOverrides(currentConfig, event);
        const newConfiguration = await this.db.kandelOperations.createNewKandelConfiguration(kandelConfiguration);

        const kandelVersion = await this.db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    // routerAddress: event.router ?? currentVersion.routerAddress,
                    // adminId: event.admin ? new AccountId(kandelId.chainId, event.admin) : currentVersion.adminId,
                    congigurationId: newConfiguration.id,
                });
            },
        });

        await this.createKandelParamsEvent(kandelId, kandelVersion, event);

    }

    getKandelConfigWithOverrides(currentConfig: prisma.KandelConfiguration, overrides: SetParams): Omit<prisma.KandelConfiguration, "id"> {
        return {
            compoundRateBase: overrides.compoundRates ? overrides.compoundRates.base : currentConfig.compoundRateBase,
            compoundRateQuote: overrides.compoundRates ? overrides.compoundRates.quote : currentConfig.compoundRateQuote,
            gasPrice: overrides.gasPrice ?? currentConfig.gasPrice,
            gasReq: overrides.gasReq ?? currentConfig.gasReq,
            spread: overrides.geometric ? overrides.geometric.spread : currentConfig.spread,
            ratio: overrides.geometric ? overrides.geometric.ratio : currentConfig.ratio,
            length: overrides.length ?? currentConfig.length
        }
    };

    async createKandelParamsEvent(kandelId: KandelId, kandelVersion: prisma.KandelVersion, event: SetParams ) {
        const kandelEvent = await this.db.kandelOperations.createKandelEvent(kandelId, kandelVersion);
        // if (event.admin) {
        //     await this.db.kandelOperations.createKandelAdminEvent(kandelEvent, event.admin);
        // } else if (event.router) {
        //     await this.db.kandelOperations.createKandelRouterEvent(kandelEvent, event.router);
        // } else 
        if (event.gasReq) {
            await this.db.kandelOperations.createKandelGasReqEvent(kandelEvent, event.gasReq);
        } else if (event.gasPrice) {
            await this.db.kandelOperations.createKandelGasPriceEvent(kandelEvent, event.gasPrice);
        } else if (event.length) {
            await this.db.kandelOperations.createKandelLengthEvent(kandelEvent, event.length);
        } else if (event.compoundRates) {
            await this.db.kandelOperations.createKandelCompoundRateEvent(kandelEvent, event.compoundRates.base, event.compoundRates.quote);
        } else if (event.geometric) {
            await this.db.kandelOperations.createKandelGeometricParamsEvent(kandelEvent, event.geometric.ratio, event.geometric.spread);
        }
        throw new Error(`Could not find correct kandel event: ${event}`);
    }


    async handleDepositWithdrawal(
        undo: boolean,
        kandelId: KandelId,
        event: Debit | Credit,
        transaction: prisma.Transaction | undefined) {

        const reserveAddress = await this.db.kandelOperations.getReserveAddress({kandelId});
        const reserveId = new AccountId(kandelId.chainId, reserveAddress);
        const tokenId = new TokenId(kandelId.chainId, event.token);
        const tokenBalanceId = new TokenBalanceId({ accountId: reserveId, tokenId: tokenId });

        if (undo) {
            await this.db.kandelOperations.deleteLatestKandelVersion(kandelId);
            await this.db.tokenBalanceOperations.deleteLatestTokenBalanceVersion(tokenBalanceId)
            return;
        }

        const tokenBalance = await this.db.tokenBalanceOperations.getTokenBalanceFromKandel(kandelId, tokenId);
        const newDepositWithdrawalAmount = event.type == "Credit" ? new BigNumber(tokenBalance.deposit) : new BigNumber(tokenBalance.withdrawal)
        const newAmount = new BigNumber(newDepositWithdrawalAmount).plus(new BigNumber(event.amount)).toString()
        const plusMinus = event.type == "Debit" ? "minus" : "plus";

        const {updatedOrNewTokenBalance, newVersion:newTokenBalanceVersion} = await this.db.tokenBalanceOperations.addTokenBalanceVersion({
            tokenBalanceId: tokenBalanceId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    withdrawal: event.type == "Debit" ? newAmount : tokenBalance.withdrawal,
                    deposit: event.type == "Credit" ? newAmount : tokenBalance.deposit,
                    balance: new BigNumber(tokenBalance.balance)[plusMinus](new BigNumber(newAmount))

                })
            }
        })

        const tokenBalanceEvent = await this.db.tokenBalanceOperations.createTokenBalanceEvent(reserveId, kandelId, tokenId, newTokenBalanceVersion);
        if( event.type == "Debit" ){
            await this.db.tokenBalanceOperations.createTokenBalanceDepositEvent(tokenBalanceEvent, event.amount, prisma.TokenBalanceEventSource.KANDEL);
        } else {
            await this.db.tokenBalanceOperations.createTokenBalanceWithdrawalEvent(tokenBalanceEvent, event.amount, prisma.TokenBalanceEventSource.KANDEL);
        }



        await this.db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    reserveVersionId: newTokenBalanceVersion.id,
                    trigger: event.type
                });
            },
        });
    }

    async handlePopulate(
        undo: boolean,
        kandelId: KandelId,
        event: Populate,
        transaction: prisma.Transaction | undefined
    ) {
        if (undo) {
            await this.db.kandelOperations.deleteLatestKandelVersion(kandelId);
            return;
        }
        await this.db.kandelOperations.addVersionedKandel({
            id: kandelId,
            txId: transaction!.id,
            updateFunc: (model) => {
                _.merge(model, {
                    trigger: event.type
                });
            },
        })
    }

    async handleOfferIndex(
        undo: boolean,
        kandelId: KandelId,
        event: OfferIndex,
        transaction: prisma.Transaction | undefined
    ) {
        const kandel = await this.db.kandelOperations.getKandel(kandelId);
        const base = await this.db.kandelOperations.getToken(kandelId, "baseId");
        const quote = await this.db.kandelOperations.getToken(kandelId, "quoteId");
        const offerId = new OfferId(new MangroveId(kandelId.chainId, kandel.mangroveId), {
            outboundToken: event.ba === "ask" ? base.address : quote.address,
            inboundToken: event.ba === "ask" ? quote.address : base.address,
        }, event.offerId);

        if (undo) {
            await this.db.kandelOperations.deleteOfferIndex(kandelId, offerId, event.ba);
            return;
        }


        await this.db.kandelOperations.createOfferIndex(kandelId, transaction!.id, offerId, event.index, event.ba);

    }




}


