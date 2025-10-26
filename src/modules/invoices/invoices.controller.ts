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
}
