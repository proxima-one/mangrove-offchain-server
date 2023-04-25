import { ObjectType, Field } from "type-graphql";
import { Token } from "@generated/type-graphql";

@ObjectType()
export class MangroveOrderFillWithTokens {
    constructor(params: {
        totalFee: string,
        mangroveOrderId?: string,
        taker: string,
        inboundToken: Token,
        outboundToken: Token,
        price: number,
        type: string,
        fillsId: string,
        time: Date,
        takerGot: number,
        txHash: string
    }) {
        this.totalFee = params.totalFee;
        this.mangroveOrderId = params.mangroveOrderId;
        this.taker = params.taker;
        this.inbound = params.inboundToken;
        this.outbound = params.outboundToken;
        this.price = params.price;
        this.type = params.type;
        this.fillsId = params.fillsId;
        this.time = params.time;
        this.takerGot = params.takerGot;
        this.txHash = params.txHash;

    }

    @Field( )
    fillsId: string;

    @Field( )
    totalFee: string;

    @Field( )
    mangroveOrderId?: string;

    @Field( )
    taker: string;

    @Field( )
    type: string;

    @Field( )
    inbound: Token

    @Field( )
    outbound: Token

    @Field( )
    price: number;

    @Field( )
    takerGot: number;

    @Field( )
    time: Date;

    @Field( )
    txHash: string;
}


@ObjectType()
export class MangroveOrderOpenOrder {

    constructor(params: {
        mangroveOrderId: string,
        isBuy: boolean,
        isFailed: boolean,
        isFilled: boolean,
        offerId?: string
        taker: string,
        inboundToken?: Token,
        outboundToken?: Token,
        price?: number
        status?: "Cancelled" | "Failed" | "Filled" | "Partial Fill" | "Open",
        isOpen: boolean,
        failedReason?: string,
        expiryDate?: Date
        date: Date,
        takerGot?: string,
        takerWants: string
    }) {
        this.mangroveOrderId = params.mangroveOrderId
        this.isBuy = params.isBuy;
        this.isOpen = params.isOpen;
        this.isFailed = params.isFailed;
        this.isFilled = params.isFilled;
        this.offerId = params.offerId;
        this.taker = params.taker;
        this.inbound = params.inboundToken;
        this.outbound = params.outboundToken;
        this.price = params.price;
        this.status = params.status;
        this.failedReason = params.failedReason;
        this.expiryDate = params.expiryDate;
        this.date = params.date;
        this.takerGot = params.takerGot;
        this.takerWants = params.takerWants;

    }

    @Field( )
    mangroveOrderId!: string;

    @Field( )
    isBuy!: boolean;

    @Field( )
    isFailed!: boolean;

    @Field( )
    isFilled!: boolean;

    @Field( )
    offerId?: string;

    @Field( )
    taker!: string;

    @Field( )
    inbound?: Token

    @Field( )
    outbound?: Token

    @Field( )
    price?: number;

    @Field( )
    status?: string;

    @Field( )
    isOpen!: boolean;

    @Field( )
    failedReason?: string;

    @Field( )
    expiryDate?: Date;

    @Field( )
    date!: Date;

    @Field( )
    takerGot?: string;

    @Field( )
    takerWants!: string;

}
