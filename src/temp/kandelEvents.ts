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
    kandelParams:KandelParams;
}
export interface KandelParamsUpdated {
    type: "KandelParamsUpdated";
    kandelParams: KandelParams,
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
    token: Address;
}

interface KandelParams {
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
