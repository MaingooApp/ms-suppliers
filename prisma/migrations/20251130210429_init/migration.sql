-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cifNif" TEXT NOT NULL,
    "address" TEXT,
    "phoneNumber" TEXT,
    "commercialName" TEXT,
    "commercialPhoneNumber" TEXT,
    "deliveryDays" TEXT,
    "minPriceDelivery" DECIMAL(10,2),
    "sanitaryRegistrationNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "type" TEXT,
    "invoiceNumber" TEXT,
    "blobName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasDeliveryNotes" BOOLEAN NOT NULL DEFAULT false,
    "documentType" TEXT NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "suppliersProductId" TEXT,
    "masterProductId" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "price" DECIMAL(12,2),
    "tax" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "productReference" TEXT,
    "masterProductId" TEXT,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_cifNif_key" ON "Supplier"("cifNif");

-- CreateIndex
CREATE INDEX "Supplier_cifNif_idx" ON "Supplier"("cifNif");

-- CreateIndex
CREATE INDEX "Invoice_enterpriseId_idx" ON "Invoice"("enterpriseId");

-- CreateIndex
CREATE INDEX "Invoice_supplierId_idx" ON "Invoice"("supplierId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_suppliersProductId_idx" ON "InvoiceLine"("suppliersProductId");

-- CreateIndex
CREATE INDEX "InvoiceLine_masterProductId_idx" ON "InvoiceLine"("masterProductId");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierProduct_masterProductId_idx" ON "SupplierProduct"("masterProductId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_suppliersProductId_fkey" FOREIGN KEY ("suppliersProductId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;