-- AlterTable: Change price column from INTEGER to DECIMAL(12,2)
ALTER TABLE "InvoiceLine" ALTER COLUMN "price" TYPE DECIMAL(12,2) USING "price"::numeric;
