import { Injectable, Logger } from '@nestjs/common';
import { KafkaService, KAFKA_TOPICS } from '../../common/kafka/kafka.service';
import { prisma } from '../../prisma/prisma.service';

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(private kafkaService: KafkaService) {}

  async publish(eventType: string, payload: any) {
    const outbox = await prisma.outbox.create({
      data: { eventType, payload: JSON.parse(JSON.stringify(payload)) },
    });

    return outbox.id;
  }

  async processPending() {
    const pending = await prisma.outbox.findMany({
      where: { status: 'PENDING' },
      take: 50,
    });

    for (const record of pending) {
      try {
        await this.kafkaService.publish(record.eventType, [{ value: JSON.stringify(record.payload) }]);
        await prisma.outbox.update({
          where: { id: record.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      } catch (error: any) {
        this.logger.error(`Failed to publish outbox record ${record.id}: ${error.message}`);
        // Mark as failed after max retries would be handled by a scheduler
      }
    }
  }
}
