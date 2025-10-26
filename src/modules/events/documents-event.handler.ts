import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy } from '@nestjs/microservices';

import { InvoicesService } from '../invoices/invoices.service';
import { DocumentsEvents, SuppliersEvents, NATS_SERVICE } from 'src/config';

interface DocumentAnalyzedPayload {
  documentId: string;
  enterpriseId: string;
  extraction: {
    supplierName?: string;
    supplierTaxId?: string;
    invoiceNumber?: string;
    issueDate?: string;
    totalAmount?: number;
    taxAmount?: number;
    currency?: string;
    lines?: Array<{
      description?: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
    }>;
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
      const { enterpriseId, extraction } = payload;

      if (!extraction.supplierName) {
        this.logger.warn(`⚠️  Missing supplier name, skipping invoice creation`);
        return;
      }

      if (!extraction.supplierTaxId) {
        this.logger.warn(`⚠️  Missing supplier tax ID (CIF/NIF) - continuing anyway`);
      }

      if (!extraction.totalAmount) {
        this.logger.warn(`⚠️  Missing total amount, skipping invoice creation`);
        return;
      }

      // Crear la factura automáticamente
      const invoice = await this.invoicesService.createInvoice({
        enterpriseId,
        supplierName: extraction.supplierName,
        supplierCifNif: extraction.supplierTaxId,
        invoiceNumber: extraction.invoiceNumber,
        amount: extraction.totalAmount,
        date: extraction.issueDate || new Date().toISOString(),
        lines: extraction.lines?.map((line) => ({
          quantity: line.quantity || 1,
          unitPrice: line.unitPrice || 0,
          price: line.total,
          description: line.description,
          // TODO: Calcular impuesto individual por línea si es necesario
          tax: null
        }))
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

  @EventPattern(DocumentsEvents.failed)
  handleDocumentAnalysisFailed(@Payload() payload: any) {
    this.logger.warn(`⚠️  Document analysis failed: ${payload.documentId} - ${payload.reason}`);
  }
}
