import { Module } from '@nestjs/common';

import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { NatsModule } from '../../transports/nats.module';

@Module({
  imports: [SuppliersModule, NatsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService]
})
export class InvoicesModule {}
