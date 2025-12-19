import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RpcException, ClientProxy } from '@nestjs/microservices';

import { SuppliersService } from '../suppliers/suppliers.service';
import { NATS_SERVICE, SuppliersEvents, ProductsSubjects } from 'src/config';
import { AzureBlobService } from './azure-blob.service';
import { firstValueFrom } from 'rxjs';

interface CreateInvoicePayload {
  enterpriseId: string;
  supplierId?: string;
  supplierName?: string;
  supplierCifNif?: string;
  invoiceNumber?: string;
  hasDeliveryNotes: boolean;
  documentType: string;
  blobName?: string;
  amount: number;
  date: string;
  type?: string;
  lines?: Array<{
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
          payload.supplierCifNif,
          payload.enterpriseId
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
          hasDeliveryNotes: payload.hasDeliveryNotes,
          documentType: payload.documentType,
          amount: payload.amount,
          date: payload.date,
          type: payload.type,
          invoiceLines: payload.lines
            ? {
                create: payload.lines.map((line) => ({
                  productCode: line.productCode,
                  description: line.description,
                  productUnit: line.productUnit,
                  unitCount: line.unitCount,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  linePrice: line.linePrice,
                  price: line.price,
                  tax: line.tax,
                  discountCode: line.discountCode,
                  additionalReference: line.additionalReference,
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

  /**
   * Elimina una factura por su ID
   * Revierte los cambios de inventario si la factura afectó el stock
   */
  async deleteInvoice(id: string) {
    try {
      // Obtener la factura con sus líneas para verificar si hay que revertir inventario
      const invoice = await this.invoice.findUnique({
        where: { id },
        include: {
          invoiceLines: {
            select: {
              quantity: true,
              masterProductId: true
            }
          }
        }
      });

      if (!invoice) {
        throw new RpcException({ status: 404, message: 'Invoice not found' });
      }

      // Determinar si esta factura afectó el inventario (misma lógica que updateInventoryIfNeeded)
      const shouldRevertInventory =
        invoice.documentType === 'delivery_note' ||
        (invoice.documentType === 'invoice' && !invoice.hasDeliveryNotes);

      // Revertir inventario si es necesario
      if (shouldRevertInventory && invoice.invoiceLines.length > 0) {
        const stockUpdates = invoice.invoiceLines
          .filter((line) => line.masterProductId)
          .map((line) => ({
            productId: line.masterProductId!,
            quantity: -line.quantity // Negativo para decrementar
          }));

        if (stockUpdates.length > 0) {
          try {
            const result = await firstValueFrom(
              this.client.send(ProductsSubjects.updateStock, stockUpdates)
            );
            this.logger.log(
              `📦 Inventory reverted for invoice ${id}: ${stockUpdates.length} products updated`
            );
          } catch (error) {
            this.logger.warn(`⚠️  Failed to revert inventory for invoice ${id}:`, error);
            // Continuar con la eliminación aunque falle la reversión del inventario
          }
        }
      }

      // Eliminar el documento del blob storage si existe
      if (invoice.blobName) {
        try {
          await this.azureBlobService.deleteDocument(invoice.blobName);
          this.logger.log(`🗑️  Deleted blob: ${invoice.blobName}`);
        } catch (error) {
          this.logger.warn(`⚠️  Failed to delete blob ${invoice.blobName}:`, error);
          // Continuar con la eliminación de la factura aunque falle el blob
        }
      }

      // Eliminar la factura (las líneas se eliminan en cascada)
      await this.invoice.delete({
        where: { id }
      });

      this.logger.log(`🗑️  Invoice deleted: ${id}`);

      return { success: true, message: 'Invoice deleted successfully' };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error(`Error deleting invoice ${id}`, error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  /**
   * Verifica si ya existe una factura con el mismo número y tipo de documento
   */
  async checkInvoiceExists(
    invoiceNumber: string,
    documentType: string,
    enterpriseId: string
  ): Promise<{ exists: boolean; invoiceId?: string }> {
    try {
      const existingInvoice = await this.invoice.findFirst({
        where: {
          invoiceNumber,
          documentType,
          enterpriseId
        },
        select: { id: true }
      });

      return {
        exists: !!existingInvoice,
        invoiceId: existingInvoice?.id
      };
    } catch (error) {
      this.logger.error('Error checking invoice existence', error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }
}
