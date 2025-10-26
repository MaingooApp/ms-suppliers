import { Module } from '@nestjs/common';

import { NatsModule } from './transports/nats.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [NatsModule, SuppliersModule, InvoicesModule, EventsModule]
})
export class AppModule {}
