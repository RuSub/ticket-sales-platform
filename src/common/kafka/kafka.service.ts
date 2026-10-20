import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer } from 'kafkajs';

export const KAFKA_TOPICS = {
  ORDER_CREATED: 'events.order.created',
  ORDER_PAID: 'events.order.paid',
  ORDER_CANCELLED: 'events.order.cancelled',
  SEAT_RESERVED: 'events.seat.reserved',
  SEAT_AVAILABLE: 'events.seat.available',
  PAYMENT_COMPLETED: 'events.payment.completed',
  PAYMENT_FAILED: 'events.payment.failed',
  NOTIFICATION_EMAIL: 'events.notification.email',
  RETURN_REQUESTED: 'events.return.requested',
  RETURN_APPROVED: 'events.return.approved',
  RETURN_REJECTED: 'events.return.rejected',
} as const;

@Injectable()
export class KafkaService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Consumer[] = [];

  constructor() {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    this.kafka = new Kafka({
      clientId: 'ticket-platform',
      brokers,
    });
  }

  async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    }
    return this.producer;
  }

  async publish(topic: string, messages: { value: string }[]) {
    const producer = await this.getProducer();
    await producer.send({ topic, messages });
  }

  async subscribe(topic: string, handler: (messages: any[]) => Promise<void>) {
    const consumer = this.kafka.consumer({ groupId: `ticket-platform-${topic}` });
    await consumer.connect();

    // Wait for the group join so messages published right after subscribe()
    // resolves are not skipped (a fresh consumer starts at the latest offset).
    const joined = new Promise<void>((resolve) => {
      consumer.on(consumer.events.GROUP_JOIN, () => resolve());
      setTimeout(resolve, 15_000);
    });

    await consumer.subscribe({ topic });
    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          await handler([message]);
        } catch (error) {
          this.logger.error(`Kafka consumer error for ${topic}: ${error}`);
        }
      },
    });

    await joined;
    this.consumers.push(consumer);
    this.logger.log(`Kafka consumer subscribed to ${topic}`);
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
    }
    for (const consumer of this.consumers) {
      await consumer.disconnect();
    }
  }
}
