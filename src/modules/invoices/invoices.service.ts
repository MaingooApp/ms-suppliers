import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RpcException, ClientProxy } from '@nestjs/microservices';

import { SuppliersService } from '../suppliers/suppliers.service';
import { NATS_SERVICE, SuppliersEvents } from 'src/config';
import { AzureBlobService } from './azure-blob.service';

interface CreateInvoicePayload {
  enterpriseId: string;
  supplierId?: string;
  supplierName?: string;
  supplierCifNif?: string;
  invoiceNumber?: string;
  blobName?: string;
  amount: number;
  date: string;
  type?: string;
  lines?: Array<{
    quantity: number;
    unitPrice: number;
    price?: number;
    description?: string;
    tax?: string | null;
    masterProductId?: string;
  }>;
}

@Injectable()
export class InvoicesService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly suppliersService: SuppliersService,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly azureBlobService: AzureBlobService
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('📊 Prisma connected for InvoicesService');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('📊 Prisma disconnected for InvoicesService');
  }

  async createInvoice(payload: CreateInvoicePayload) {
    try {
      let supplierId = payload.supplierId;

      // Si no viene supplierId pero sí el nombre del proveedor, crear/buscar
      if (!supplierId && payload.supplierName && payload.supplierCifNif) {
        const supplier = await this.suppliersService.findOrCreateSupplier(
          payload.supplierName,
          payload.supplierCifNif
        );
        supplierId = supplier.id;
      }

      if (!supplierId) {
        throw new RpcException({
          status: 400,
          message: 'supplierId or (supplierName and supplierCifNif) is required'
        });
      }

      const invoice = await this.invoice.create({
        data: {
          enterpriseId: payload.enterpriseId,
          supplierId,
          invoiceNumber: payload.invoiceNumber,
          blobName: payload.blobName,
          amount: payload.amount,
          date: payload.date,
          type: payload.type,
          invoiceLines: payload.lines
            ? {
                create: payload.lines.map((line) => ({
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  price: line.price,
                  description: line.description,
                  tax: line.tax,
                  masterProductId: line.masterProductId
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

  /**
   * Obtiene la URL temporal del documento de la factura
   */
  async getInvoiceDocumentUrl(invoiceId: string, expiresInHours: number = 24) {
    try {
      const invoice = await this.invoice.findUnique({
        where: { id: invoiceId },
        select: { blobName: true }
      });

      if (!invoice) {
        throw new RpcException({ status: 404, message: 'Invoice not found' });
      }

      if (!invoice.blobName) {
        throw new RpcException({ status: 404, message: 'Invoice document not found' });
      }

      const url = await this.azureBlobService.getDocumentUrl(invoice.blobName, expiresInHours);

      return {
        url,
        expiresIn: expiresInHours,
        blobName: invoice.blobName
      };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error(`Error getting invoice document URL for ${invoiceId}`, error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  /**
   * Obtiene URLs temporales para múltiples facturas (útil para exportación)
   */
  async getMultipleInvoiceDocumentUrls(invoiceIds: string[], expiresInHours: number = 48) {
    try {
      const invoices = await this.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, blobName: true }
      });

      const blobNames = invoices.filter((inv) => inv.blobName).map((inv) => inv.blobName!);

      if (blobNames.length === 0) {
        return [];
      }

      const urlsMap = await this.azureBlobService.getMultipleDocumentUrls(
        blobNames,
        expiresInHours
      );

      return invoices
        .filter((inv) => inv.blobName && urlsMap.has(inv.blobName))
        .map((inv) => ({
          invoiceId: inv.id,
          blobName: inv.blobName!,
          url: urlsMap.get(inv.blobName!)!,
          expiresIn: expiresInHours
        }));
    } catch (error) {
      this.logger.error('Error getting multiple invoice document URLs', error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }
}
