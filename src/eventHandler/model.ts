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
    public readonly offerNumber: number
  ) {
    super(`${mangroveId}-${offerNumber}`);
  }
}

export class OfferListId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey
  ) {
    super(
      `${mangroveId}-${offerListKey.inboundToken}-${offerListKey.outboundToken}`
    );
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
      `${mangroveId}-${offerListKey.inboundToken}-${offerListKey.outboundToken}-${ownerAddress}-${spenderAddress}`
    );
  }
}

export class OrderId extends Id {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly order: string
  ) {
    super(
      `${mangroveId}-${offerListKey.inboundToken}-${offerListKey.outboundToken}-${order}`
    );
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
