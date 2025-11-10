-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN "masterProductId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceLine_masterProductId_idx" ON "InvoiceLine"("masterProductId");
