import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';

import type { CreateSupplierDto } from './dto';

@Injectable()
export class SuppliersService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuppliersService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Suppliers database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Suppliers database connection closed');
  }

  async createSupplier(payload: CreateSupplierDto) {
    try {
      const existing = await this.supplier.findFirst({
        where: {
          cifNif: payload.cifNif,
          enterpriseId: payload.enterpriseId
        }
      });

      if (existing) {
        throw new RpcException({
          status: 400,
          message: `Supplier with CIF/NIF ${payload.cifNif} already exists for this enterprise`
        });
      }

      const supplier = await this.supplier.create({
        data: payload
      });

      this.logger.log(`✅ Supplier created: ${supplier.name} (${supplier.cifNif})`);
      return supplier;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error('Error creating supplier', error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  async findOrCreateSupplier(name: string, cifNif: string, enterpriseId: string) {
    try {
      let supplier;

      // Buscar por CIF y enterpriseId
      supplier = await this.supplier.findFirst({
        where: {
          cifNif,
          enterpriseId
        }
      });

      // Si no se encontró por CIF, buscar por nombre (case insensitive) y enterpriseId
      if (!supplier) {
        supplier = await this.supplier.findFirst({
          where: {
            name: {
              equals: name,
              mode: 'insensitive'
            },
            enterpriseId
          }
        });
      }

      // Si no existe, crear nuevo proveedor
      if (!supplier) {
        supplier = await this.supplier.create({
          data: { name, cifNif, enterpriseId }
        });
        this.logger.log(
          `✅ Auto-created supplier: ${name} (${cifNif}) for enterprise ${enterpriseId}`
        );
      } else {
        this.logger.log(`📌 Found existing supplier: ${name}`);
      }

      return supplier;
    } catch (error) {
      this.logger.error('Error finding/creating supplier', error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  async getSupplierById(id: string) {
    const supplier = await this.supplier.findUnique({
      where: { id },
      include: {
        invoices: true,
        supplierProducts: true
      }
    });

    if (!supplier) {
      throw new RpcException({ status: 404, message: 'Supplier not found' });
    }

    return supplier;
  }

  async listSuppliers(enterpriseId?: string) {
    const where = enterpriseId ? { enterpriseId } : {};
    return this.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
  }

  async deleteSupplier(id: string) {
    try {
      const supplier = await this.supplier.findUnique({
        where: { id },
        include: {
          invoices: { select: { id: true } }
        }
      });

      if (!supplier) {
        throw new RpcException({ status: 404, message: 'Supplier not found' });
      }

      // Verificar si tiene facturas asociadas
      if (supplier.invoices.length > 0) {
        throw new RpcException({
          status: 400,
          message: `No se puede eliminar el proveedor con ${supplier.invoices.length} facturas asociadas. Elimine las facturas primero.`
        });
      }

      await this.supplier.delete({
        where: { id }
      });

      this.logger.log(`🗑️  Supplier deleted: ${supplier.name} (${id})`);

      return { success: true, message: 'Proveedor eliminado correctamente' };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error(`Error deleting supplier ${id}`, error);
      throw new RpcException({ status: 500, message: 'Internal server error' });
    }
  }

  async health() {
    return { status: 'ok' };
  }
}
