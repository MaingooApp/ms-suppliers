-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "productUnit" TEXT,
ADD COLUMN     "unitCount" TEXT,
ADD COLUMN     "linePrice" DECIMAL(12,2),
ADD COLUMN     "discountCode" TEXT,
ADD COLUMN     "additionalReference" TEXT;
