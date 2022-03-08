export type Address = string;
export type UInt = string;
export type Hash = string;
export type BlockNumber = number;
export type Int = string;

export type TransactionRef = {
  blockNumber: BlockNumber;
  blockHash: Hash;
  txHash: Hash;
  from: Address;
};
export interface OfferList {
  inboundToken: Address;
  outboundToken: Address;
}

export interface OfferListParams {
  active?: boolean;
  fee?: UInt;
  gasbase?: number; // todo: 24 bits
  density?: UInt;
}

export interface Offer {
  id: OfferId;
  prev: OfferId;
  wants: UInt;
  gives: UInt;
  gasprice: number; // todo: 16 bits
  gasreq: number; // todo: 24 bits
}

export interface MangroveParams {
  governance?: Address;
  monitor?: Address;
  vault?: Address;
  useOracle?: boolean;
  notify?: boolean;
  gasmax?: number; //todo: 24 bits
  gasprice?: number; //todo: 16 bits
  dead?: boolean;
}

export interface Order {
  taker: TakerId;
  takerGot: UInt;
  takerGave: UInt;
  penalty: UInt;
  takenOffers: TakenOffer[];
}

export interface TakenOffer {
  id: OfferId;
  takerWants: UInt;
  takerGives: UInt;
  failReason?: OfferFailReason;
  posthookFailed?: boolean;
}

export interface OracleState {
  gasprice?: UInt;
}

export type MakerId = string;
export type TakerId = string;
export type OrderId = string;
export type OfferId = number;
export type MangroveId = Address;
export type OfferFailReason =
  | "mgv/makerRevert"
  | "mgv/makerAbort"
  | "mgv/makerTransferFail"
  | "mgv/makerReceiveFail";

export type MangroveEvent = (
  | TakerApprovalUpdated
  | MakerBalanceUpdated
  | OfferListParamsUpdated
  | MangroveParamsUpdated
  | MangroveCreated
  | OfferWritten
  | OfferRetracted
  | OrderCompleted
) & {
  parentOrderId?: OrderId; // not empty in case event is emitted in callback/posthook functions
};

export interface TakerApprovalUpdated {
  type: "TakerApprovalUpdated";

  owner: Address;
  offerList: OfferList;
  spender: Address;
  amount: UInt;
}

export interface MakerBalanceUpdated {
  type: "MakerBalanceUpdated";

  maker: MakerId;
  amountChange: Int;
}

export interface MangroveCreated {
  type: "MangroveCreated";

  id: string;
  chain: {
    name: string;
    chainlistId: number;
  };
  address: string;
}

export interface OfferListParamsUpdated {
  type: "OfferListParamsUpdated";

  offerList: OfferList;
  params: OfferListParams;
}

export interface MangroveParamsUpdated {
  type: "MangroveParamsUpdated";

  params: MangroveParams;
}

export interface OfferWritten {
  type: "OfferWritten";

  offerList: OfferList;
  offer: Offer;
  maker: MakerId;
}

export interface OfferRetracted {
  type: "OfferRetracted";

  offerList: OfferList;
  offerId: OfferId;
}

export interface OrderCompleted {
  type: "OrderCompleted";

  id: OrderId;
  offerList: OfferList;
  order: Order;
}

export type MangroveStreamEventPayload = MangroveEvent & {
  tx?: TransactionRef;
  mangroveId?: MangroveId; //support multiple instances in the same event stream
};
