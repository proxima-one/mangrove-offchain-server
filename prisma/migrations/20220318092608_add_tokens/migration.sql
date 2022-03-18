/*
  Warnings:

  - You are about to drop the column `inboundToken` on the `OfferList` table. All the data in the column will be lost.
  - You are about to drop the column `outboundToken` on the `OfferList` table. All the data in the column will be lost.
  - Added the required column `inboundTokenId` to the `OfferList` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outboundTokenId` to the `OfferList` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OfferList" DROP COLUMN "inboundToken",
DROP COLUMN "outboundToken",
ADD COLUMN     "inboundTokenId" VARCHAR(255) NOT NULL,
ADD COLUMN     "outboundTokenId" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "Token" (
    "id" VARCHAR(255) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);
