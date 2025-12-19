import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { InvoicesService } from '../invoices/invoices.service';
import { DocumentsEvents, SuppliersEvents, ProductsSubjects, NATS_SERVICE } from 'src/config';

interface ExtractionLine {
  ProductCode?: string;
  ProductDescription?: string;
  ProductUnit?: string;
  UnitPrice?: number;
  UnitCount?: string;
  LinePrice?: number;
  Quantity?: number;
  LineAmount?: number;
  TaxIndicator?: string;
  DiscountCode?: string;
  AdditionalReference?: string;
}

interface DocumentAnalyzedPayload {
  documentId: string;
  enterpriseId: string;
  blobName: string;
  hasDeliveryNotes: boolean;
  documentType: string;
  extraction: {
    supplierName?: string;
    supplierTaxId?: string;
    invoiceNumber?: string;
    issueDate?: string;
    totalAmount?: number;
    taxAmount?: number;
    currency?: string;
    lines?: ExtractionLine[];
  };
}

@Controller()
export class DocumentsEventHandler {
  private readonly logger = new Logger(DocumentsEventHandler.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {}

  @EventPattern(DocumentsEvents.analyzed)
  async handleDocumentAnalyzed(@Payload() payload: DocumentAnalyzedPayload) {
    this.logger.log(`📥 Received documents.analyzed event: ${payload.documentId}`);

    try {
      const { enterpriseId, blobName, extraction } = payload;

      if (!extraction.supplierName) {
        this.logger.warn(`⚠️  Missing supplier name, skipping invoice creation`);
        return;
      }

      if (!extraction.supplierTaxId) {
        this.logger.warn(`⚠️  Missing supplier tax ID (CIF/NIF), skipping invoice creation`);
        return;
      }

      if (!extraction.totalAmount) {
        this.logger.warn(`⚠️  Missing total amount, skipping invoice creation`);
        return;
      }

      // Procesar productos de las líneas de la factura
      const processedLines = await this.processInvoiceLines(extraction.lines || [], enterpriseId);

      // Crear la factura automáticamente con blobName
      const invoice = await this.invoicesService.createInvoice({
        enterpriseId,
        supplierName: extraction.supplierName,
        supplierCifNif: extraction.supplierTaxId,
        invoiceNumber: extraction.invoiceNumber,
        blobName, // Guardar referencia al archivo en blob storage
        amount: extraction.totalAmount,
        date: extraction.issueDate || new Date().toISOString(),
        lines: processedLines,
        hasDeliveryNotes: payload.hasDeliveryNotes,
        documentType: payload.documentType
      });

      this.logger.log(`✅ Auto-created invoice ${invoice.id} for document ${payload.documentId}`);

      // Actualizar inventario si corresponde según las reglas de negocio
      await this.updateInventoryIfNeeded(
        payload.documentType,
        payload.hasDeliveryNotes,
        processedLines
      );

      // Emitir evento con documentId para que analyzer lo vincule
      this.client.emit(SuppliersEvents.invoiceProcessed, {
        documentId: payload.documentId,
        invoiceId: invoice.id,
        enterpriseId,
        success: true
      });
    } catch (error) {
      this.logger.error(`❌ Error processing document ${payload.documentId}:`, error);
      // No lanzar error para no bloquear el evento
    }
  }

  /**
   * Procesa las líneas de la factura y busca/crea productos en el catálogo
   */
  private async processInvoiceLines(lines: ExtractionLine[], enterpriseId: string) {
    const processedLines: Array<{
      productCode?: string;
      description?: string;
      productUnit?: string;
      unitCount?: string;
      quantity: number;
      unitPrice: number;
      linePrice?: number;
      price?: number;
      tax?: string | null;
      discountCode?: string;
      additionalReference?: string;
      masterProductId?: string;
    }> = [];

    for (const line of lines) {
      if (!line.ProductDescription) {
        this.logger.warn(`⚠️  Skipping line without description`);
        continue;
      }

      let masterProductId: string | undefined;

      try {
        // Llamar al microservicio de productos para buscar o crear el producto
        const product = await firstValueFrom(
          this.client.send(ProductsSubjects.findOrCreate, {
            name: line.ProductDescription,
            eanCode: line.ProductCode || undefined,
            enterpriseId,
            unit: line.ProductUnit || undefined,
            unitCount: line.UnitCount || undefined,
            lastUnitPrice: line.UnitPrice || undefined,
            additionalReference: line.AdditionalReference || undefined,
          })
        );

        masterProductId = product.id;
        this.logger.log(`✅ Product linked: ${line.ProductDescription} -> ${masterProductId}`);
      } catch (error) {
        this.logger.error(
          `❌ Error finding/creating product for line "${line.ProductDescription}":`,
          error
        );
        // Continuar sin masterProductId si falla
      }

      processedLines.push({
        productCode: line.ProductCode,
        description: line.ProductDescription,
        productUnit: line.ProductUnit,
        unitCount: line.UnitCount,
        quantity: line.Quantity || 1,
        unitPrice: line.UnitPrice || 0,
        linePrice: line.LinePrice,
        price: line.LineAmount,
        tax: line.TaxIndicator || null,
        discountCode: line.DiscountCode,
        additionalReference: line.AdditionalReference,
        masterProductId
      });
    }

    return processedLines;
  }

  /**
   * Actualiza el inventario (stock) de productos si corresponde según las reglas:
   * - delivery_note: SÍ afecta el inventario (suma al stock)
   * - invoice + hasDeliveryNotes=false: SÍ afecta el inventario (suma al stock)
   * - invoice + hasDeliveryNotes=true: NO afecta (ya se sumó con el delivery_note)
   */
  private async updateInventoryIfNeeded(
    documentType: string,
    hasDeliveryNotes: boolean,
    lines: Array<{ quantity: number; masterProductId?: string }>
  ): Promise<void> {
    // Determinar si debe afectar el inventario
    const shouldAffectInventory =
      documentType === 'delivery_note' || (documentType === 'invoice' && !hasDeliveryNotes);

    if (!shouldAffectInventory) {
      return;
    }

    // Preparar actualizaciones de stock solo para productos que tienen masterProductId
    const stockUpdates: { productId: string; quantity: number }[] = [];

    for (const line of lines) {
      if (line.masterProductId) {
        stockUpdates.push({
          productId: line.masterProductId,
          quantity: line.quantity
        });
      }
    }

    // Actualizar el stock de todos los productos de una vez
    if (stockUpdates.length > 0) {
      try {
        const result = await firstValueFrom(
          this.client.send<{ success: boolean; results: Array<{ success: boolean }> }>(
            ProductsSubjects.updateStock,
            stockUpdates
          )
        );

        this.logger.log(
          `📦 Inventory updated: ${result.results.filter((r) => r.success).length}/${stockUpdates.length} products`
        );
      } catch (error) {
        this.logger.error('❌ Failed to update inventory:', error);
      }
    }
  }
}
