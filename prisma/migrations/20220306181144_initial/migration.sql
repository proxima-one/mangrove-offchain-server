-- CreateTable
CREATE TABLE "Mangrove" (
    "id" VARCHAR(255) NOT NULL,
    "governance" TEXT,
    "monitor" TEXT,
    "vault" TEXT,
    "useOracle" BOOLEAN,
    "notify" BOOLEAN,
    "gasmax" INTEGER,
    "gasprice" INTEGER,
    "dead" BOOLEAN,

    CONSTRAINT "Mangrove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" VARCHAR(255) NOT NULL,
    "address" VARCHAR(80) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakerApproval" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "offerListId" VARCHAR(255) NOT NULL,
    "ownerId" VARCHAR(255) NOT NULL,
    "spenderId" VARCHAR(255) NOT NULL,
    "value" VARCHAR(80) NOT NULL,

    CONSTRAINT "TakerApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakerBalance" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(100) NOT NULL,
    "makerId" VARCHAR(255) NOT NULL,
    "balance" VARCHAR(80) NOT NULL,

    CONSTRAINT "MakerBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferList" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "inboundToken" VARCHAR(42) NOT NULL,
    "outboundToken" VARCHAR(42) NOT NULL,
    "active" BOOLEAN,
    "fee" VARCHAR(80),
    "gasbase" INTEGER,
    "density" VARCHAR(80),

    CONSTRAINT "OfferList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" VARCHAR(255) NOT NULL,
    "offerListId" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "makerId" VARCHAR(255) NOT NULL,
    "prevOfferId" TEXT,
    "wants" VARCHAR(80) NOT NULL,
    "gives" VARCHAR(80) NOT NULL,
    "gasprice" INTEGER NOT NULL,
    "gasreq" INTEGER NOT NULL,
    "live" BOOLEAN NOT NULL,
    "deprovisioned" BOOLEAN NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "offerListId" VARCHAR(255) NOT NULL,
    "takerId" VARCHAR(255) NOT NULL,
    "takerGot" TEXT NOT NULL,
    "takerGave" TEXT NOT NULL,
    "penalty" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakenOffer" (
    "id" VARCHAR(255) NOT NULL,
    "orderId" VARCHAR(255) NOT NULL,
    "takerWants" VARCHAR(80) NOT NULL,
    "takerGives" VARCHAR(80) NOT NULL,
    "posthookFailed" BOOLEAN NOT NULL,
    "failReason" TEXT,

    CONSTRAINT "TakenOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Streams" (
    "id" VARCHAR(50) NOT NULL,
    "state" VARCHAR(255) NOT NULL,

    CONSTRAINT "Streams_pkey" PRIMARY KEY ("id")
);
