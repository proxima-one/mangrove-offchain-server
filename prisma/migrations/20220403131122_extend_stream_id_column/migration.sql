/*
  Warnings:

  - The primary key for the `Streams` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Streams" DROP CONSTRAINT "Streams_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "Streams_pkey" PRIMARY KEY ("id");
