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

    @Field( {nullable: true})
    fillsId: string;

    @Field( {nullable: true})
    totalFee: string;

    @Field( {nullable: true})
    mangroveOrderId?: string;

    @Field( {nullable: true})
    taker: string;

    @Field( {nullable: true})
    type: string;

    @Field( {nullable: true})
    inbound: Token

    @Field( {nullable: true})
    outbound: Token

    @Field( {nullable: true})
    price: number;

    @Field( {nullable: true})
    takerGot: number;

    @Field( {nullable: true})
    time: Date;

    @Field( {nullable: true})
    txHash: string;
}


@ObjectType()
export class MangroveOrderOpenOrder {

    constructor(params: {
        side: "Buy" | "Sell",
        offerId?: string
        taker: string,
        inboundToken?: Token,
        outboundToken?: Token,
        price?: string
        status?: "Cancelled" | "Failed" | "Filled" | "Partial Fill" | "Open" | "Expired",
        failedReason?: string,
        expiryDate?: Date
        date: Date,
        takerGot?: string,
        takerWants: string
    }) {
        this.side = params.side;
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

    @Field( {nullable: true})
    side!: string;

    @Field( {nullable: true})
    offerId?: string;

    @Field( {nullable: true})
    taker!: string;

    @Field( {nullable: true})
    inbound?: Token

    @Field( {nullable: true})
    outbound?: Token

    @Field( {nullable: true})
    price?: string;

    @Field( {nullable: true})
    status?: string;

    @Field( {nullable: true})
    failedReason?: string;

    @Field( {nullable: true})
    expiryDate?: Date;

    @Field( {nullable: true})
    date!: Date;

    @Field( {nullable: true})
    takerGot?: string;

    @Field( {nullable: true})
    takerWants!: string;

}
