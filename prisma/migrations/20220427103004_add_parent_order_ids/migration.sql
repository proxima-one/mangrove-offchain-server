-- AlterTable
ALTER TABLE "OfferVersion" ADD COLUMN     "parentOrderId" VARCHAR(255);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "parentOrderId" VARCHAR(255);

-- AlterTable
ALTER TABLE "TakerApprovalVersion" ADD COLUMN     "parentOrderId" VARCHAR(255);
