/*
  Warnings:

  - You are about to drop the column `dead` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `gasmax` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `gasprice` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `governance` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `monitor` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `notify` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `useOracle` on the `Mangrove` table. All the data in the column will be lost.
  - You are about to drop the column `vault` on the `Mangrove` table. All the data in the column will be lost.
  - Added the required column `currentVersionId` to the `Mangrove` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Mangrove" DROP COLUMN "dead",
DROP COLUMN "gasmax",
DROP COLUMN "gasprice",
DROP COLUMN "governance",
DROP COLUMN "monitor",
DROP COLUMN "notify",
DROP COLUMN "useOracle",
DROP COLUMN "vault",
ADD COLUMN     "currentVersionId" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "MangroveVersion" (
    "id" VARCHAR(255) NOT NULL,
    "mangroveId" VARCHAR(255) NOT NULL,
    "governance" TEXT,
    "monitor" TEXT,
    "vault" TEXT,
    "useOracle" BOOLEAN,
    "notify" BOOLEAN,
    "gasmax" INTEGER,
    "gasprice" INTEGER,
    "dead" BOOLEAN,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" TEXT,

    CONSTRAINT "MangroveVersion_pkey" PRIMARY KEY ("id")
);
