import { Module } from '@nestjs/common';

import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { AzureBlobService } from './azure-blob.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { NatsModule } from '../../transports/nats.module';

@Module({
  imports: [SuppliersModule, NatsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, AzureBlobService],
  exports: [InvoicesService]
})
export class InvoicesModule {}
