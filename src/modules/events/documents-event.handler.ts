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
      const processedLines = await this.processInvoiceLines(extraction.lines || []);

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
  private async processInvoiceLines(lines: ExtractionLine[]) {
    const processedLines: Array<{
      quantity: number;
      unitPrice: number;
      price?: number;
      description?: string;
      tax?: string | null;
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
            eanCode: line.ProductCode || undefined
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
        quantity: line.Quantity || 1,
        unitPrice: line.UnitPrice || 0,
        price: line.LineAmount,
        description: line.ProductDescription,
        tax: line.TaxIndicator || null,
        masterProductId
      });
    }

    return processedLines;
  }
}
