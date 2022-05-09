/*
  Warnings:

  - You are about to drop the column `value` on the `TakerApproval` table. All the data in the column will be lost.
  - Added the required column `currentVersionId` to the `TakerApproval` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TakerApproval" DROP COLUMN "value",
ADD COLUMN     "currentVersionId" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "TakerApprovalVersion" (
    "id" VARCHAR(255) NOT NULL,
    "takerApprovalId" VARCHAR(255) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "prevVersionId" TEXT,

    CONSTRAINT "TakerApprovalVersion_pkey" PRIMARY KEY ("id")
);
