/*
  Warnings:

  - You are about to drop the column `blockNumber` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `deprovisioned` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `gasprice` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `gasreq` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `gives` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `givesNumber` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `live` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `makerPaysPrice` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `prevOfferId` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `takerPaysPrice` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `time` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `wants` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `wantsNumber` on the `Offer` table. All the data in the column will be lost.
  - Added the required column `currentVersionId` to the `Offer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "blockNumber",
DROP COLUMN "deprovisioned",
DROP COLUMN "gasprice",
DROP COLUMN "gasreq",
DROP COLUMN "gives",
DROP COLUMN "givesNumber",
DROP COLUMN "live",
DROP COLUMN "makerPaysPrice",
DROP COLUMN "prevOfferId",
DROP COLUMN "takerPaysPrice",
DROP COLUMN "time",
DROP COLUMN "wants",
DROP COLUMN "wantsNumber",
ADD COLUMN     "currentVersionId" VARCHAR(255) NOT NULL,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OfferVersion" (
    "id" VARCHAR(255) NOT NULL,
    "offerId" VARCHAR(255) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "time" TIMESTAMP NOT NULL,
    "prevOfferId" TEXT,
    "wants" VARCHAR(80) NOT NULL,
    "wantsNumber" DOUBLE PRECISION NOT NULL,
    "gives" VARCHAR(80) NOT NULL,
    "givesNumber" DOUBLE PRECISION NOT NULL,
    "takerPaysPrice" DOUBLE PRECISION,
    "makerPaysPrice" DOUBLE PRECISION,
    "gasprice" INTEGER NOT NULL,
    "gasreq" INTEGER NOT NULL,
    "live" BOOLEAN NOT NULL,
    "deprovisioned" BOOLEAN NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" TEXT,

    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);
