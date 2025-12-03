import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { InvoicesService } from './invoices.service';
import { SuppliersSubjects } from 'src/config';

@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @MessagePattern(SuppliersSubjects.createInvoice)
  createInvoice(@Payload() payload: any) {
    return this.invoicesService.createInvoice(payload);
  }

  @MessagePattern(SuppliersSubjects.getInvoice)
  getInvoice(@Payload() payload: { id: string }) {
    return this.invoicesService.getInvoiceById(payload.id);
  }

  @MessagePattern(SuppliersSubjects.listInvoices)
  listInvoices(@Payload() payload?: { enterpriseId?: string }) {
    return this.invoicesService.listInvoices(payload?.enterpriseId);
  }

  @MessagePattern(SuppliersSubjects.getInvoiceDocumentUrl)
  getInvoiceDocumentUrl(@Payload() payload: { invoiceId: string; expiresInHours?: number }) {
    return this.invoicesService.getInvoiceDocumentUrl(
      payload.invoiceId,
      payload.expiresInHours || 24
    );
  }

  @MessagePattern(SuppliersSubjects.getMultipleInvoiceDocumentUrls)
  getMultipleInvoiceDocumentUrls(
    @Payload() payload: { invoiceIds: string[]; expiresInHours?: number }
  ) {
    return this.invoicesService.getMultipleInvoiceDocumentUrls(
      payload.invoiceIds,
      payload.expiresInHours || 48
    );
  }

  @MessagePattern(SuppliersSubjects.deleteInvoice)
  deleteInvoice(@Payload() payload: { id: string }) {
    return this.invoicesService.deleteInvoice(payload.id);
  }

  @MessagePattern(SuppliersSubjects.checkInvoiceExists)
  checkInvoiceExists(
    @Payload() payload: { invoiceNumber: string; documentType: string; enterpriseId: string }
  ) {
    return this.invoicesService.checkInvoiceExists(
      payload.invoiceNumber,
      payload.documentType,
      payload.enterpriseId
    );
  }
}
