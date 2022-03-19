/*
  Warnings:

  - Added the required column `givesNumber` to the `Offer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wantsNumber` to the `Offer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `takerGaveNumber` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `takerGotNumber` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `takerGivesNumber` to the `TakenOffer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `takerWantsNumber` to the `TakenOffer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "givesNumber" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "makerPaysPrice" DOUBLE PRECISION,
ADD COLUMN     "takerPaysPrice" DOUBLE PRECISION,
ADD COLUMN     "wantsNumber" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "makerPaidPrice" DOUBLE PRECISION,
ADD COLUMN     "takerGaveNumber" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "takerGotNumber" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "takerPaidPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TakenOffer" ADD COLUMN     "makerPaysPrice" DOUBLE PRECISION,
ADD COLUMN     "takerGivesNumber" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "takerPaysPrice" DOUBLE PRECISION,
ADD COLUMN     "takerWantsNumber" DOUBLE PRECISION NOT NULL;
