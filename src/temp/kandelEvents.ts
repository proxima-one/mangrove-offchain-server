import { Address, TxRef } from "@proximaone/stream-schema-base";
import { core } from "@proximaone/stream-schema-mangrove";
import { OfferRetracted, OfferWritten } from "@proximaone/stream-schema-mangrove/dist/events";
export declare type KandelEvent = (NewKandel | SetParams | Debit | Credit | Populate | Retract | SetIndexMapping | SetAdmin | SetRouter) & {
    tx: TxRef;
    id: string;
    chainId: number;
    address: Address;
};
export interface NewKandel {
    type: "NewKandel";
    kandelType: "Kandel" | "AaveKandel";
    mangroveId: core.MangroveId;
    base: Address;
    quote: Address;
    owner: Address;
    reserve: Address;
    router: Address;
    address:Address;
    compoundRates: {
        base: number;
        quote: number;
    };
    gasPrice: string;
    gasReq: string;
}
export interface SetParams {
    type: "SetParams";
    compoundRates?: {
        base: number;
        quote: number;
    };
    geometric?: {
        spread: number;
        ratio: number;
    };
    gasPrice?: string;
    gasReq?: string;
    length?: number;
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

export interface Retract {
    type: "Retract";
    kandelAddress: Address;
    offers: OfferRetracted[];
}

export interface Populate {
    type: "Populate";
    kandelAddress: Address;
    offers: OfferWritten[];
    indexMapping: SetIndexMapping[];
}

export interface SetIndexMapping {
    type: "SetIndexMapping";
    ba: 0 | 1;
    index: number;
    offerId: number;
}

export interface SetAdmin {
    type: "SetAdmin";
    admin: Address;
}

export interface SetRouter {
    type: "SetRouter"
    router: Address;
}

