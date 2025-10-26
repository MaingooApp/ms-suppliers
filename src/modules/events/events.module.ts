import { Module } from '@nestjs/common';

import { DocumentsEventHandler } from './documents-event.handler';
import { InvoicesModule } from '../invoices/invoices.module';
import { NatsModule } from 'src/transports/nats.module';

@Module({
  imports: [InvoicesModule, NatsModule],
  controllers: [DocumentsEventHandler]
})
export class EventsModule {}
