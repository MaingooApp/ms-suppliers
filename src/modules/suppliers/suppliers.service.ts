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
      const existing = await this.supplier.findUnique({
        where: { cifNif: payload.cifNif }
      });

      if (existing) {
        throw new RpcException({
          status: 400,
          message: `Supplier with CIF/NIF ${payload.cifNif} already exists`
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

  async findOrCreateSupplier(name: string, cifNif: string) {
    try {
      let supplier;

      // Buscar por CIF
      supplier = await this.supplier.findUnique({
        where: { cifNif }
      });

      // Si no se encontró por CIF, buscar por nombre (case insensitive)
      if (!supplier) {
        supplier = await this.supplier.findFirst({
          where: {
            name: {
              equals: name,
              mode: 'insensitive'
            }
          }
        });
      }

      // Si no existe, crear nuevo proveedor
      if (!supplier) {
        supplier = await this.supplier.create({
          data: { name, cifNif }
        });
        this.logger.log(`✅ Auto-created supplier: ${name} (${cifNif})`);
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

  async listSuppliers() {
    return this.supplier.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async health() {
    return { status: 'ok' };
  }
}
