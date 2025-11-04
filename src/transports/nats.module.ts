import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { envs, NATS_SERVICE } from 'src/config';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: NATS_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.natsServers,
          reconnect: true,
          maxReconnectAttempts: -1,
          reconnectTimeWait: 2000,
          timeout: 5000,
          name: 'ms-suppliers'
        }
      }
    ])
  ],
  exports: [ClientsModule]
})
export class NatsModule {}
