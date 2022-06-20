-- CreateTable
CREATE TABLE "Strat" (
    "id" VARCHAR(255) NOT NULL,

    CONSTRAINT "Strat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSummary" (
    "id" VARCHAR(255) NOT NULL,
    "txId" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "stratId" VARCHAR(255) NOT NULL,
    "offerListId" VARCHAR(255) NOT NULL,
    "takerId" VARCHAR(255) NOT NULL,
    "selling" BOOLEAN NOT NULL,
    "takerGot" TEXT NOT NULL,
    "takerGotNumber" DOUBLE PRECISION NOT NULL,
    "takerGave" TEXT NOT NULL,
    "takerGaveNumber" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "penalty" TEXT NOT NULL,
    "penaltyNumber" DOUBLE PRECISION NOT NULL,
    "restingOrderId" VARCHAR(255) NOT NULL,

    CONSTRAINT "OrderSummary_pkey" PRIMARY KEY ("id")
);
