import { AccountOperations } from "./accountOperations";
import { ChainOperations } from "./chainOperations";
import { PrismaTx } from "./dbOperations";
import { MakerBalanceOperations } from "./makerBalanceOperations";
import { MangroveOperations } from "./mangroveOperations";
import { MangroveOrderOperations } from "./mangroveOrderOperations";
import { OfferListingOperations } from "./offerListingOperations";
import { OfferOperations } from "./offerOperations";
import { OrderOperations } from "./orderOperations";
import { TokenOperations } from "./tokenOperations";
import { TakerApprovalOperations } from "./takerApprovalOperations";
import { TransactionOperations } from "./transactionOperations";
import { KandelOperations } from "./kandelOperations";
import { ReserveOperations } from "./reserveOperations";

export type AllDbOperations = {
  accountOperations: AccountOperations;
  chainOperations: ChainOperations;
  makerBalanceOperations: MakerBalanceOperations;
  mangroveOperation: MangroveOperations;
  mangroveOrderOperations: MangroveOrderOperations;
  offerListOperations: OfferListingOperations;
  offerOperations: OfferOperations;
  orderOperations: OrderOperations;
  takerApprovalOperations: TakerApprovalOperations;
  tokenOperations: TokenOperations;
  transactionOperations: TransactionOperations;
  kandelOperations: KandelOperations;
  reserveOperations: ReserveOperations;
};

export function allDbOperations(tx: PrismaTx): AllDbOperations {
  return {
    accountOperations: new AccountOperations(tx),
    chainOperations: new ChainOperations(tx),
    makerBalanceOperations: new MakerBalanceOperations(tx),
    mangroveOperation: new MangroveOperations(tx),
    mangroveOrderOperations: new MangroveOrderOperations(tx),
    offerListOperations: new OfferListingOperations(tx),
    offerOperations: new OfferOperations(tx),
    orderOperations: new OrderOperations(tx),
    takerApprovalOperations: new TakerApprovalOperations(tx),
    tokenOperations: new TokenOperations(tx),
    transactionOperations: new TransactionOperations(tx),
    kandelOperations: new KandelOperations(tx),
    reserveOperations: new ReserveOperations(tx),
  };
}
