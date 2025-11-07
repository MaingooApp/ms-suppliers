-- AlterTable: Rename restaurantId to enterpriseId
ALTER TABLE "Invoice" RENAME COLUMN "restaurantId" TO "enterpriseId";

-- Update index name for consistency
DROP INDEX IF EXISTS "Invoice_restaurantId_idx";
CREATE INDEX "Invoice_enterpriseId_idx" ON "Invoice"("enterpriseId");
