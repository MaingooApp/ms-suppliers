import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RpcException, ClientProxy } from '@nestjs/microservices';

import { SuppliersService } from '../suppliers/suppliers.service';
import { NATS_SERVICE, SuppliersEvents } from 'src/config';

interface CreateInvoicePayload {
  enterpriseId: string;
  supplierId?: string;
  supplierName?: string;
  supplierCifNif?: string;
  invoiceNumber?: string;
  amount: number;
  date: string;
  type?: string;
  imageUrl?: string;
  lines?: Array<{
    quantity: number;
    unitPrice: number;
    price?: number;
    description?: string;
    tax?: string | null;
  }>;
}

@Injectable()
export class InvoicesService extends PrismaClient {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly suppliersService: SuppliersService,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {
    super();
  }

  async createInvoice(payload: CreateInvoicePayload) {
    try {
      let supplierId = payload.supplierId;

      // Si no viene supplierId pero sí el nombre del proveedor, crear/buscar
      if (!supplierId && payload.supplierName) {
        const supplier = await this.suppliersService.findOrCreateSupplier(
          payload.supplierName,
          payload.supplierCifNif || null
        );
        supplierId = supplier.id;
      }

      if (!supplierId) {
        throw new RpcException({
          status: 400,
          message: 'supplierId or supplierName is required'
        });
      }

      const invoice = await this.invoice.create({
        data: {
          enterpriseId: payload.enterpriseId,
          supplierId,
          invoiceNumber: payload.invoiceNumber,
          amount: payload.amount,
          date: payload.date,
          type: payload.type,
          imageUrl: payload.imageUrl,
          invoiceLines: payload.lines
            ? {
                create: payload.lines.map((line) => ({
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  price: line.price,
                  description: line.description,
                  tax: line.tax
                }))
              }
            : undefined
        },
        include: {
          supplier: true,
          invoiceLines: true
        }
      });

      this.logger.log(`✅ Invoice created: ${invoice.invoiceNumber || invoice.id}`);

      // Emitir evento
      this.client.emit(SuppliersEvents.invoiceCreated, {
        invoiceId: invoice.id,
        enterpriseId: invoice.enterpriseId,
        supplierId: invoice.supplierId,
        amount: invoice.amount,
        createdAt: invoice.createdAt.toISOString()
      });

      return invoice;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error('Error creating invoice', error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  async getInvoiceById(id: string) {
    const invoice = await this.invoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        invoiceLines: true
      }
    });

    if (!invoice) {
      throw new RpcException({ status: 404, message: 'Invoice not found' });
    }

    return invoice;
  }

  async listInvoices(enterpriseId?: string) {
    return this.invoice.findMany({
      where: enterpriseId ? { enterpriseId } : undefined,
      include: {
        supplier: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
