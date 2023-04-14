import { ObjectType, Field } from "type-graphql";
import { Token } from "@generated/type-graphql";

@ObjectType()
export class MangroveOrderFills {
    constructor(params: {
        fillWants: boolean,
        totalFee: string,
        restingOrderId?: string,
        id: string,
        taker: string,
        inboundToken?: Token,
        outboundToken?: Token,
        price?: string,
        expiryDate?: Date,
        firstDate: Date,
        takerGot?: string,
        takerWants: string
    }) {
        this.fillWants = params.fillWants;
        this.totalFee = params.totalFee;
        this.restingOrderId = params.restingOrderId;
        this.id = params.id;
        this.taker = params.taker;
        this.inbound = params.inboundToken;
        this.outbound = params.outboundToken;
        this.price = params.price;
        this.expiryDate = params.expiryDate;
        this.firstDate = params.firstDate;
        this.takerGot = params.takerGot;
        this.takerWants = params.takerWants;

    }


    @Field()
    fillWants!: boolean;

    @Field()
    totalFee!: string;

    @Field()
    restingOrderId?: string;

    @Field()
    id!: string;

    @Field()
    taker!: string;

    @Field()
    inbound?: Token

    @Field()
    outbound?: Token

    @Field()
    price?: string;

    @Field()
    takerGot?: string;

    @Field()
    expiryDate?: Date;

    @Field()
    firstDate!: Date;

    @Field()
    takerWants!: string;
}


@ObjectType()
export class MangroveOrderOpenOrder {

    constructor(params: {
        fillWants: boolean,
        totalFee: string
        id: string
        taker: string,
        inboundToken?: Token,
        outboundToken?: Token,
        price?: string
        cancelled?: boolean,
        failed?: boolean,
        failedReason?: string,
        filled?: boolean,
        expiryDate?: Date
        date: Date,
        takerGot?: string,
        takerWants: string
    }) {
        this.fillWants = params.fillWants;
        this.totalFee = params.totalFee;
        this.id = params.id;
        this.taker = params.taker;
        this.inbound = params.inboundToken;
        this.outbound = params.outboundToken;
        this.price = params.price;
        this.cancelled = params.cancelled;
        this.failed = params.failed;
        this.failedReason = params.failedReason;
        this.filled = params.filled;
        this.expiryDate = params.expiryDate;
        this.date = params.date;
        this.takerGot = params.takerGot;
        this.takerWants = params.takerWants;

    }

    @Field()
    fillWants!: boolean;

    @Field()
    totalFee!: string;

    @Field()
    id!: string;

    @Field()
    taker!: string;

    @Field()
    inbound?: Token

    @Field()
    outbound?: Token

    @Field()
    price?: string;

    @Field()
    cancelled?: boolean;

    @Field()
    failed?: boolean;

    @Field()
    failedReason?: string;

    @Field()
    filled?: boolean;

    @Field()
    expiryDate?: Date;

    @Field()
    date!: Date;

    @Field()
    takerGot?: string;

    @Field()
    takerWants!: string;

}
