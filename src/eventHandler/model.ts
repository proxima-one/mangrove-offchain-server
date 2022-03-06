import { MangroveStreamEventPayload } from "./events";
import { createPatternMatcher } from "../utils/discriminatedUnion";

export class Id {
  public constructor(public readonly value: string) {}
}

export class AccountId extends Id {
  public constructor(public readonly address: string) {
    super(address);
  }
}

export class OfferId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly offerNumber: number
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}-${offerNumber}`);
  }
}

export class OfferListId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}`);
  }
}

export class MakerBalanceId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly address: string
  ) {
    super(`${mangroveId}-${address}`);
  }
}

export class TakerApprovalId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly ownerAddress: string,
    public readonly spenderAddress: string
  ) {
    super(
      `${mangroveId}-${offerListKeyShortStr(
        offerListKey
      )}-${ownerAddress}-${spenderAddress}`
    );
  }
}

export class OrderId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly order: string
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}-${order}`);
  }
}

export class TakenOfferId extends Id {
  public constructor(
    public readonly orderId: OrderId,
    public readonly offerNumber: number
  ) {
    super(`${orderId.value}-${offerNumber}`);
  }
}

function offerListKeyShortStr({
  inboundToken,
  outboundToken,
}: OfferListKey): string {
  return `${inboundToken.substring(0, 6)}x${outboundToken.substring(0, 6)}`;
}

export interface OfferListKey {
  inboundToken: string;
  outboundToken: string;
}

export interface DomainEvent {
  payload: MangroveStreamEventPayload;
  timestamp: Date;
  undo: boolean;
  state: string;
}

export const eventMatcher = createPatternMatcher<MangroveStreamEventPayload>();
