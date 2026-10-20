import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { prisma } from '../../prisma/prisma.service';

const BATCH_SIZE = 50;

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(private readonly kafkaService: KafkaService) {}

  async publish(eventType: string, payload: unknown) {
    const outbox = await prisma.outbox.create({
      data: { eventType, payload: JSON.parse(JSON.stringify(payload)) },
    });

    return outbox.id;
  }

  /**
   * Publishes pending outbox records; returns how many were published.
   * Stops the batch on the first failure so a dead broker is not hammered.
   */
  async processPending(): Promise<number> {
    if (!process.env.KAFKA_BROKERS) {
      return 0;
    }

    const pending = await prisma.outbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let published = 0;
    for (const record of pending) {
      try {
        await this.kafkaService.publish(record.eventType, [
          { value: JSON.stringify(record.payload) },
        ]);
        await prisma.outbox.update({
          where: { id: record.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        published += 1;
      } catch (error) {
        this.logger.error(
          `Failed to publish outbox record ${record.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }
    }

    return published;
  }
}
