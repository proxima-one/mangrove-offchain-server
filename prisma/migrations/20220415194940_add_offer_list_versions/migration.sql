/*
  Warnings:

  - You are about to drop the column `active` on the `OfferList` table. All the data in the column will be lost.
  - You are about to drop the column `density` on the `OfferList` table. All the data in the column will be lost.
  - You are about to drop the column `fee` on the `OfferList` table. All the data in the column will be lost.
  - You are about to drop the column `gasbase` on the `OfferList` table. All the data in the column will be lost.
  - Added the required column `currentVersionId` to the `OfferList` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OfferList" DROP COLUMN "active",
DROP COLUMN "density",
DROP COLUMN "fee",
DROP COLUMN "gasbase",
ADD COLUMN     "currentVersionId" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "OfferListVersion" (
    "id" VARCHAR(255) NOT NULL,
    "offerListId" VARCHAR(255) NOT NULL,
    "active" BOOLEAN,
    "fee" VARCHAR(80),
    "gasbase" INTEGER,
    "density" VARCHAR(80),
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" TEXT,

    CONSTRAINT "OfferListVersion_pkey" PRIMARY KEY ("id")
);
