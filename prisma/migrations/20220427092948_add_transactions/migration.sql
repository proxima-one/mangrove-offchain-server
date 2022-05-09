/*
  Warnings:

  - You are about to alter the column `prevVersionId` on the `MakerBalanceVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `prevVersionId` on the `MangroveVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `prevVersionId` on the `OfferListVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the column `blockNumber` on the `OfferVersion` table. All the data in the column will be lost.
  - You are about to drop the column `time` on the `OfferVersion` table. All the data in the column will be lost.
  - You are about to alter the column `prevOfferId` on the `OfferVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `prevVersionId` on the `OfferVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to drop the column `blockNumber` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `time` on the `Order` table. All the data in the column will be lost.
  - You are about to alter the column `prevVersionId` on the `TakerApprovalVersion` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - Added the required column `txId` to the `MakerBalanceVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txId` to the `OfferListVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txId` to the `OfferVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txId` to the `TakerApprovalVersion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MakerBalanceVersion" ADD COLUMN     "txId" VARCHAR(255) NOT NULL,
ALTER COLUMN "prevVersionId" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "MangroveVersion" ADD COLUMN     "txId" VARCHAR(255),
ALTER COLUMN "prevVersionId" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "OfferListVersion" ADD COLUMN     "txId" VARCHAR(255) NOT NULL,
ALTER COLUMN "prevVersionId" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "OfferVersion" DROP COLUMN "blockNumber",
DROP COLUMN "time",
ADD COLUMN     "txId" VARCHAR(255) NOT NULL,
ALTER COLUMN "prevOfferId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "prevVersionId" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "blockNumber",
DROP COLUMN "time",
ADD COLUMN     "txId" VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE "TakerApprovalVersion" ADD COLUMN     "txId" VARCHAR(255) NOT NULL,
ALTER COLUMN "prevVersionId" SET DATA TYPE VARCHAR(255);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" VARCHAR(255) NOT NULL,
    "txHash" VARCHAR(80) NOT NULL,
    "from" VARCHAR(80) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" VARCHAR(80) NOT NULL,
    "time" TIMESTAMP NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
