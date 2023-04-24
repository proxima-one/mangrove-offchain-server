import assert from "assert";
import {assert as chaiAssert} from "chai"
import { slice } from "lodash";
import { describe } from "mocha";
import { toBigNumber } from "src/utils/numberUtils";
import { KandelReturnUtils, baseQuoteBalance, period, simpleOfferVersion, simplePrismaOfferVersion } from "src/utils/KandelReturnUtils";


let baseToken = {
    id: "tokenA",
    decimals: 18,
    symbol: "A"
}
let quoteToken = {
    id: "tokenB",
    decimals: 6,
    symbol: "B"
}
let rates= {
    base: {
        token: baseToken,
        rate: 1
    }, quote: {
        token: quoteToken,
        rate: 1
    }
}

let kandelReturnUtils = new KandelReturnUtils();

const offers = [
    { offerId: "base-1", token: baseToken },
    { offerId: "base-2", token: baseToken },
    { offerId: "base-3", token: baseToken },
    { offerId: "base-4", token: baseToken },
    { offerId: "quote-1", token: quoteToken },
    { offerId: "quote-2", token: quoteToken },
    { offerId: "quote-3", token: quoteToken },
    { offerId: "quote-4", token: quoteToken },
]

describe("Kandel Return Unit test suite", () => {
    it(KandelReturnUtils.prototype.calculateReturn.name, () => {

        let periods: period[] = [];


        periods.push(createPeriod({ type: "Populate", start: new Date(2023, 0, 1), end: new Date(2023, 1, 10), offers: offers.map(v => { return { ...v, gives: toBigNumber({ value: "10", token: v.token}).toString() } }), baseSend: "20", baseReceived: "22", quoteSend: "30", quoteReceived: "33" }))
        periods.push(createPeriod({ type: "Retract", start: new Date(2023, 1, 10), end: new Date(2023, 3, 23), offers: offers.map(v => { return { ...v, gives: toBigNumber({ value: "0", token: v.token}).toString() } }), baseSend: "20", baseReceived: "22", quoteSend: "30", quoteReceived: "33" }))
        periods.push(createPeriod({ type: "Populate", start: new Date(2023, 3, 23), end: new Date(2023, 5, 25), offers: offers.map(v => { return { ...v, gives: toBigNumber({ value: "5", token: v.token}).toString() } }), baseSend: "40", baseReceived: "46", quoteSend: "50", quoteReceived: "57" }))
        periods.push(createPeriod({ type: "Populate", start: new Date(2023, 5, 25), end: new Date(2023, 9, 27), offers: offers.map(v => { return { ...v, gives: toBigNumber({ value: "20", token: v.token}).toString() } }), baseSend: "120", baseReceived: "134", quoteSend: "110", quoteReceived: "123" }))

        const avgReturn = kandelReturnUtils.calculateReturn(periods,rates)
        chaiAssert.closeTo(avgReturn, 0.0338, 0.0001)
    })

    it(KandelReturnUtils.prototype.convertOfferVersion.name, () => {
        let simplePrismaOffer:simplePrismaOfferVersion = {
            offerId: "offerId-1",
            gives: "10",
            offer:{
                offerListing: {
                    outboundToken: baseToken
                }
            }
        }
        const simpleOffer= kandelReturnUtils.convertOfferVersion(simplePrismaOffer);
        assert.deepStrictEqual( simpleOffer, {
            offerId: simplePrismaOffer.offerId,
            gives: simplePrismaOffer.gives,
            token: simplePrismaOffer.offer.offerListing.outboundToken
        })
    })

    describe(KandelReturnUtils.prototype.getOfferedVolume.name, () => {
        it("index > 0 + isRetract = false", () => {
            let index = 1;
            let period = createPeriod({ type: "Populate", start: new Date(2023, 0, 1), end: new Date(2023, 1, 10), offers: offers.map(v => { return { ...v, gives: toBigNumber({ value: "10", token: v.token}).toString() } }), baseSend: "20", baseReceived: "22", quoteSend: "30", quoteReceived: "33" })
            let isRetract = false;
            period.offers.slice(0,3).reduce((result, current) => result.set(current.offerId, "2") ,new Map<string,string>() )
            let previous = [{ offeredPerOffer: new Map<string,string>() }]
            

        })
        it("index = 0 + isRetract = false", () => {
            
        })
        it("index > 0 + isRetract = true", () => {
            
        })
        it("index = 0 + isRetract = true", () => {
            
        })
    })

})

function createPeriod(params: { type: "Retract" | "Populate", start: Date, end: Date, offers: simpleOfferVersion[], baseSend: string, baseReceived: string, quoteSend: string, quoteReceived: string }): period {
    return {
        start: params.start,
        end: params.end,
        type: params.type,
        offers: params.offers,
        ...createBaseQuoteBalance(params)
    };
}

function createBaseQuoteBalance(params: { baseSend: string; baseReceived: string; quoteSend: string; quoteReceived: string; }): baseQuoteBalance {
    return {
        baseTokenBalanceVersion: {
            send: toBigNumber({ value: params.baseSend, token: baseToken }).toString(),
            received:  toBigNumber({ value: params.baseReceived, token: baseToken }).toString()
        },
        quoteTokenBalanceVersion: {
            send:  toBigNumber({ value: params.quoteSend, token: quoteToken }).toString(),
            received: toBigNumber({ value: params.quoteReceived, token: quoteToken }).toString(),
        }
    };
}

