/*
  Warnings:

  - You are about to drop the column `balance` on the `MakerBalance` table. All the data in the column will be lost.
  - Added the required column `currentVersionId` to the `MakerBalance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MakerBalance" DROP COLUMN "balance",
ADD COLUMN     "currentVersionId" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "MakerBalanceVersion" (
    "id" VARCHAR(255) NOT NULL,
    "makerBalanceId" VARCHAR(255) NOT NULL,
    "balance" VARCHAR(80) NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" TEXT,

    CONSTRAINT "MakerBalanceVersion_pkey" PRIMARY KEY ("id")
);
