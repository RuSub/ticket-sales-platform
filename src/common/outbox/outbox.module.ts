import { Module } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxScheduler } from './outbox.scheduler';

@Module({
  providers: [KafkaService, OutboxPublisher, OutboxScheduler],
  exports: [OutboxPublisher, KafkaService],
})
export class OutboxModule {}
