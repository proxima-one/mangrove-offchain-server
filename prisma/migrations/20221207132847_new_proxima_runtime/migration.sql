/*
  Warnings:

  - You are about to drop the column `state` on the `Streams` table. All the data in the column will be lost.
  - Added the required column `offset` to the `Streams` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Streams" DROP COLUMN "state",
ADD COLUMN     "offset" VARCHAR(255) NOT NULL;
