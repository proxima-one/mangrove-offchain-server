/*
  Warnings:

  - You are about to drop the `Strat` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[chainId,address]` on the table `Account` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,makerId]` on the table `MakerBalance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[makerBalanceId,versionNumber]` on the table `MakerBalanceVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chainId,address]` on the table `Mangrove` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,orderId]` on the table `MangroveOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveOrderId,versionNumber]` on the table `MangroveOrderVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,versionNumber]` on the table `MangroveVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,offerListingId,offerNumber]` on the table `Offer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,inboundTokenId,outboundTokenId]` on the table `OfferListing` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[offerListingId,versionNumber]` on the table `OfferListingVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderId,offerVersionId]` on the table `TakenOffer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mangroveId,offerListingId,ownerId,spenderId]` on the table `TakerApproval` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[takerApprovalId,versionNumber]` on the table `TakerApprovalVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chainId,address]` on the table `Token` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chainId,txHash]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TokenBalanceEventSource" AS ENUM ('KANDEL', 'OTHER');

-- DropIndex
DROP INDEX "MangroveVersion_id_key";

-- AlterTable
ALTER TABLE "OfferVersion" ADD COLUMN     "kandelPopulateEventId" VARCHAR(255),
ADD COLUMN     "kandelRetractEventId" TEXT;

-- AlterTable
ALTER TABLE "TakenOffer" ALTER COLUMN "takerGot" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "Strat";

-- CreateTable
CREATE TABLE "TokenBalance" (
    "id" VARCHAR(255) NOT NULL,
    "reserveId" VARCHAR(255) NOT NULL,
    "tokenId" VARCHAR(255) NOT NULL,
    "currentVersionId" VARCHAR(255) NOT NULL,

    CONSTRAINT "TokenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBalanceEvent" (
    "id" TEXT NOT NULL,
    "reserveId" VARCHAR(255) NOT NULL,
    "kandelId" VARCHAR(255),
    "tokenId" VARCHAR(255) NOT NULL,
    "tokenBalanceVersionId" VARCHAR(255) NOT NULL,
    "takenOfferId" VARCHAR(255),

    CONSTRAINT "TokenBalanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBalanceDepositEvent" (
    "id" TEXT NOT NULL,
    "tokenBalanceEventId" VARCHAR(255) NOT NULL,
    "source" "TokenBalanceEventSource" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "TokenBalanceDepositEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBalanceWithdrawalEvent" (
    "id" TEXT NOT NULL,
    "tokenBalanceEventId" VARCHAR(255) NOT NULL,
    "source" "TokenBalanceEventSource" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "TokenBalanceWithdrawalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBalanceVersion" (
    "id" VARCHAR(255) NOT NULL,
    "txId" VARCHAR(255) NOT NULL,
    "tokenBalanceId" VARCHAR(255) NOT NULL,
    "deposit" TEXT NOT NULL,
    "withdrawal" TEXT NOT NULL,
    "spent" TEXT NOT NULL,
    "earned" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" VARCHAR(255),

    CONSTRAINT "TokenBalanceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kandel" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "baseId" VARCHAR(255) NOT NULL,
    "quoteId" VARCHAR(255) NOT NULL,
    "reserveId" VARCHAR(255) NOT NULL,
    "type" TEXT NOT NULL,
    "currentVersionId" VARCHAR(255) NOT NULL,

    CONSTRAINT "Kandel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelOfferIndex" (
    "offerId" VARCHAR(255) NOT NULL,
    "kandelId" VARCHAR(255) NOT NULL,
    "txId" VARCHAR(255) NOT NULL,
    "index" INTEGER NOT NULL,
    "ba" TEXT NOT NULL,

    CONSTRAINT "KandelOfferIndex_pkey" PRIMARY KEY ("offerId","kandelId","ba")
);

-- CreateTable
CREATE TABLE "KandelEvent" (
    "id" TEXT NOT NULL,
    "kandelVersionId" VARCHAR(255),
    "kandelId" VARCHAR(255) NOT NULL,

    CONSTRAINT "KandelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelCompoundRateEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "compoundRateBase" DOUBLE PRECISION NOT NULL,
    "compoundRateQuote" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KandelCompoundRateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelGasPriceEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "gasPrice" TEXT NOT NULL,

    CONSTRAINT "KandelGasPriceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelGasReqEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "gasReq" TEXT NOT NULL,

    CONSTRAINT "KandelGasReqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelGeometricParamsEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KandelGeometricParamsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelLengthEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "KandelLengthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelAdminEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "admin" TEXT NOT NULL,

    CONSTRAINT "KandelAdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelRouterEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,
    "router" TEXT NOT NULL,

    CONSTRAINT "KandelRouterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewKandelEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,

    CONSTRAINT "NewKandelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelPopulateEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,

    CONSTRAINT "KandelPopulateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelRetractEvent" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(255) NOT NULL,

    CONSTRAINT "KandelRetractEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelVersion" (
    "id" VARCHAR(255) NOT NULL,
    "kandelId" VARCHAR(255) NOT NULL,
    "txId" VARCHAR(255) NOT NULL,
    "congigurationId" VARCHAR(255) NOT NULL,
    "adminId" VARCHAR(255) NOT NULL,
    "routerAddress" VARCHAR(255) NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" VARCHAR(255),

    CONSTRAINT "KandelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KandelConfiguration" (
    "id" TEXT NOT NULL,
    "compoundRateBase" DOUBLE PRECISION NOT NULL,
    "compoundRateQuote" DOUBLE PRECISION NOT NULL,
    "gasPrice" TEXT NOT NULL,
    "gasReq" TEXT NOT NULL,
    "spread" DOUBLE PRECISION NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "KandelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalance_currentVersionId_key" ON "TokenBalance"("currentVersionId");

-- CreateIndex
CREATE INDEX "TokenBalance_tokenId_idx" ON "TokenBalance"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalance_reserveId_tokenId_key" ON "TokenBalance"("reserveId", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceEvent_tokenBalanceVersionId_key" ON "TokenBalanceEvent"("tokenBalanceVersionId");

-- CreateIndex
CREATE INDEX "TokenBalanceEvent_tokenId_idx" ON "TokenBalanceEvent"("tokenId");

-- CreateIndex
CREATE INDEX "TokenBalanceEvent_kandelId_idx" ON "TokenBalanceEvent"("kandelId");

-- CreateIndex
CREATE INDEX "TokenBalanceEvent_reserveId_idx" ON "TokenBalanceEvent"("reserveId");

-- CreateIndex
CREATE INDEX "TokenBalanceEvent_takenOfferId_idx" ON "TokenBalanceEvent"("takenOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceDepositEvent_tokenBalanceEventId_key" ON "TokenBalanceDepositEvent"("tokenBalanceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceWithdrawalEvent_tokenBalanceEventId_key" ON "TokenBalanceWithdrawalEvent"("tokenBalanceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceVersion_prevVersionId_key" ON "TokenBalanceVersion"("prevVersionId");

-- CreateIndex
CREATE INDEX "TokenBalanceVersion_txId_idx" ON "TokenBalanceVersion"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceVersion_tokenBalanceId_versionNumber_key" ON "TokenBalanceVersion"("tokenBalanceId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Kandel_id_key" ON "Kandel"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Kandel_currentVersionId_key" ON "Kandel"("currentVersionId");

-- CreateIndex
CREATE INDEX "Kandel_baseId_idx" ON "Kandel"("baseId");

-- CreateIndex
CREATE INDEX "Kandel_quoteId_idx" ON "Kandel"("quoteId");

-- CreateIndex
CREATE INDEX "Kandel_mangroveId_idx" ON "Kandel"("mangroveId");

-- CreateIndex
CREATE INDEX "Kandel_reserveId_idx" ON "Kandel"("reserveId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelOfferIndex_offerId_key" ON "KandelOfferIndex"("offerId");

-- CreateIndex
CREATE INDEX "KandelOfferIndex_kandelId_idx" ON "KandelOfferIndex"("kandelId");

-- CreateIndex
CREATE INDEX "KandelOfferIndex_txId_idx" ON "KandelOfferIndex"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelEvent_kandelVersionId_key" ON "KandelEvent"("kandelVersionId");

-- CreateIndex
CREATE INDEX "KandelEvent_kandelId_idx" ON "KandelEvent"("kandelId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelCompoundRateEvent_eventId_key" ON "KandelCompoundRateEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelGasPriceEvent_eventId_key" ON "KandelGasPriceEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelGasReqEvent_eventId_key" ON "KandelGasReqEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelGeometricParamsEvent_eventId_key" ON "KandelGeometricParamsEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelLengthEvent_eventId_key" ON "KandelLengthEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelAdminEvent_eventId_key" ON "KandelAdminEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelRouterEvent_eventId_key" ON "KandelRouterEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "NewKandelEvent_eventId_key" ON "NewKandelEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelPopulateEvent_eventId_key" ON "KandelPopulateEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelRetractEvent_eventId_key" ON "KandelRetractEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelVersion_prevVersionId_key" ON "KandelVersion"("prevVersionId");

-- CreateIndex
CREATE INDEX "KandelVersion_txId_idx" ON "KandelVersion"("txId");

-- CreateIndex
CREATE INDEX "KandelVersion_congigurationId_idx" ON "KandelVersion"("congigurationId");

-- CreateIndex
CREATE INDEX "KandelVersion_adminId_idx" ON "KandelVersion"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "KandelVersion_kandelId_versionNumber_key" ON "KandelVersion"("kandelId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Account_chainId_address_key" ON "Account"("chainId", "address");

-- CreateIndex
CREATE INDEX "MakerBalance_makerId_idx" ON "MakerBalance"("makerId");

-- CreateIndex
CREATE UNIQUE INDEX "MakerBalance_mangroveId_makerId_key" ON "MakerBalance"("mangroveId", "makerId");

-- CreateIndex
CREATE INDEX "MakerBalanceVersion_txId_idx" ON "MakerBalanceVersion"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "MakerBalanceVersion_makerBalanceId_versionNumber_key" ON "MakerBalanceVersion"("makerBalanceId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Mangrove_chainId_address_key" ON "Mangrove"("chainId", "address");

-- CreateIndex
CREATE INDEX "MangroveOrder_stratId_idx" ON "MangroveOrder"("stratId");

-- CreateIndex
CREATE INDEX "MangroveOrder_offerListingId_idx" ON "MangroveOrder"("offerListingId");

-- CreateIndex
CREATE INDEX "MangroveOrder_takerId_idx" ON "MangroveOrder"("takerId");

-- CreateIndex
CREATE INDEX "MangroveOrder_orderId_idx" ON "MangroveOrder"("orderId");

-- CreateIndex
CREATE INDEX "MangroveOrder_restingOrderId_idx" ON "MangroveOrder"("restingOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "MangroveOrder_mangroveId_orderId_key" ON "MangroveOrder"("mangroveId", "orderId");

-- CreateIndex
CREATE INDEX "MangroveOrderVersion_txId_idx" ON "MangroveOrderVersion"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "MangroveOrderVersion_mangroveOrderId_versionNumber_key" ON "MangroveOrderVersion"("mangroveOrderId", "versionNumber");

-- CreateIndex
CREATE INDEX "MangroveVersion_txId_idx" ON "MangroveVersion"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "MangroveVersion_mangroveId_versionNumber_key" ON "MangroveVersion"("mangroveId", "versionNumber");

-- CreateIndex
CREATE INDEX "Offer_offerListingId_idx" ON "Offer"("offerListingId");

-- CreateIndex
CREATE INDEX "Offer_makerId_idx" ON "Offer"("makerId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_mangroveId_offerListingId_offerNumber_key" ON "Offer"("mangroveId", "offerListingId", "offerNumber");

-- CreateIndex
CREATE INDEX "OfferListing_inboundTokenId_idx" ON "OfferListing"("inboundTokenId");

-- CreateIndex
CREATE INDEX "OfferListing_outboundTokenId_idx" ON "OfferListing"("outboundTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferListing_mangroveId_inboundTokenId_outboundTokenId_key" ON "OfferListing"("mangroveId", "inboundTokenId", "outboundTokenId");

-- CreateIndex
CREATE INDEX "OfferListingVersion_txId_idx" ON "OfferListingVersion"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferListingVersion_offerListingId_versionNumber_key" ON "OfferListingVersion"("offerListingId", "versionNumber");

-- CreateIndex
CREATE INDEX "OfferVersion_txId_idx" ON "OfferVersion"("txId");

-- CreateIndex
CREATE INDEX "OfferVersion_offerId_idx" ON "OfferVersion"("offerId");

-- CreateIndex
CREATE INDEX "OfferVersion_parentOrderId_idx" ON "OfferVersion"("parentOrderId");

-- CreateIndex
CREATE INDEX "OfferVersion_kandelPopulateEventId_idx" ON "OfferVersion"("kandelPopulateEventId");

-- CreateIndex
CREATE INDEX "OfferVersion_kandelRetractEventId_idx" ON "OfferVersion"("kandelRetractEventId");

-- CreateIndex
CREATE INDEX "Order_txId_idx" ON "Order"("txId");

-- CreateIndex
CREATE INDEX "Order_parentOrderId_idx" ON "Order"("parentOrderId");

-- CreateIndex
CREATE INDEX "Order_mangroveId_idx" ON "Order"("mangroveId");

-- CreateIndex
CREATE INDEX "Order_offerListingId_idx" ON "Order"("offerListingId");

-- CreateIndex
CREATE INDEX "Order_takerId_idx" ON "Order"("takerId");

-- CreateIndex
CREATE INDEX "TakenOffer_offerVersionId_idx" ON "TakenOffer"("offerVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TakenOffer_orderId_offerVersionId_key" ON "TakenOffer"("orderId", "offerVersionId");

-- CreateIndex
CREATE INDEX "TakerApproval_offerListingId_idx" ON "TakerApproval"("offerListingId");

-- CreateIndex
CREATE INDEX "TakerApproval_ownerId_idx" ON "TakerApproval"("ownerId");

-- CreateIndex
CREATE INDEX "TakerApproval_spenderId_idx" ON "TakerApproval"("spenderId");

-- CreateIndex
CREATE UNIQUE INDEX "TakerApproval_mangroveId_offerListingId_ownerId_spenderId_key" ON "TakerApproval"("mangroveId", "offerListingId", "ownerId", "spenderId");

-- CreateIndex
CREATE INDEX "TakerApprovalVersion_txId_idx" ON "TakerApprovalVersion"("txId");

-- CreateIndex
CREATE INDEX "TakerApprovalVersion_parentOrderId_idx" ON "TakerApprovalVersion"("parentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "TakerApprovalVersion_takerApprovalId_versionNumber_key" ON "TakerApprovalVersion"("takerApprovalId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Token_chainId_address_key" ON "Token"("chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_chainId_txHash_key" ON "Transaction"("chainId", "txHash");
