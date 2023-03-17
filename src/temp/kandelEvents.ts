import { Address, TxRef } from "@proximaone/stream-schema-base";
import { core } from "@proximaone/stream-schema-mangrove";
export declare type KandelEvent = (KandelCreated | KandelParamsUpdated | Debit | Credit | Populate | OfferIndex) & {
    tx: TxRef;
    id: string;
    chainId: number;
    address: Address;
};
export interface KandelCreated {
    type: "KandelCreated";
    mangroveId: core.MangroveId;
    base: Address;
    quote: Address;
    kandelType: "Kandel" | "AaveKandel";
    owner: Address;
    reserve: Address;
    address:Address;
    compoundRateBase: string;
    compoundRateQuote: string;
    gasPrice: string;
    gasReq: string;
    spread: string;
    ratio: string;
    length: number;
    trigger: string;
    admin: Address;
    router: Address; 
}
export interface KandelParamsUpdated {
    type: "KandelParamsUpdated";
    compoundRateBase: string | undefined;
    compoundRateQuote: string | undefined;
    gasPrice: string | undefined;
    gasReq: string | undefined;
    spread: string | undefined;
    ratio: string | undefined;
    length: number | undefined;
    admin: Address | undefined ;
    router: Address | undefined; 
}
export interface Debit {
    type: "Debit";
    amount: string;
    token: Address;
}

export interface Credit {
    type: "Credit";
    amount: string;
    token: Address;
}

export interface Populate {
    type: "Populate";
}

export interface OfferIndex {
    type: "OfferIndex";
    offerId: core.OfferId;
    index: number;
    ba: "ask" | "bid";
}


