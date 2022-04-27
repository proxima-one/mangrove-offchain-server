export class Id<T extends string | number> {
  public constructor(public readonly value: T) {}
}

export class AccountId extends Id<string> {
  public constructor(public readonly address: string) {
    super(address);
  }
}

export class TransactionId extends Id<string> {
  public constructor(
    public readonly chainId: ChainId,
    public readonly txHash: string
  ) {
    super(`${chainId.chainlistId}-${txHash}`);
  }
}

export class ChainId extends Id<number> {
  public constructor(public readonly chainlistId: number) {
    super(chainlistId);
  }
}

export class TokenId extends Id<string> {
  public constructor(
    public readonly chainId: ChainId,
    public readonly tokenAddress: string
  ) {
    super(`${chainId.chainlistId}-${tokenAddress}`);
  }
}

export class MangroveVersionId extends Id<string> {
  public constructor(
    public readonly mangroveId: string,
    public readonly versionNumber: number
  ) {
    super(`${mangroveId}-${versionNumber}`);
  }
}

export class OfferId extends Id<string> {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly offerNumber: number
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}-${offerNumber}`);
  }
}

export class OfferVersionId extends Id<string> {
  public constructor(
    public readonly offerId: OfferId,
    public readonly versionNumber: number
  ) {
    super(`${offerId.value}-${versionNumber}`);
  }
}

export class OfferListId extends Id<string> {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}`);
  }
}

export class OfferListVersionId extends Id<string> {
  public constructor(
    public readonly offerListId: OfferListId,
    public readonly versionNumber: number
  ) {
    super(`${offerListId.value}-${versionNumber}`);
  }
}

export class MakerBalanceId extends Id<string> {
  public constructor(
    public readonly mangroveId: string,
    public readonly address: string
  ) {
    super(`${mangroveId}-${address}`);
  }
}

export class MakerBalanceVersionId extends Id<string> {
  public constructor(
    public readonly makerBalanceId: MakerBalanceId,
    public readonly versionNumber: number
  ) {
    super(`${makerBalanceId.value}-${versionNumber}`);
  }
}

export class TakerApprovalId extends Id<string> {
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

export class TakerApprovalVersionId extends Id<string> {
  public constructor(
    public readonly takerApprovalId: TakerApprovalId,
    public readonly versionNumber: number
  ) {
    super(`${takerApprovalId.value}-${versionNumber}`);
  }
}

export class OrderId extends Id<string> {
  public constructor(
    public readonly mangroveId: string,
    public readonly offerListKey: OfferListKey,
    public readonly order: string
  ) {
    super(`${mangroveId}-${offerListKeyShortStr(offerListKey)}-${order}`);
  }
}

export class TakenOfferId extends Id<string> {
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
  return `${outboundToken.substring(0, 6)}x${inboundToken.substring(0, 6)}`;
}

export interface OfferListKey {
  inboundToken: string;
  outboundToken: string;
}
