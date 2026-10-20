import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { NotificationService } from '../../modules/notification/notification.service';

type NotificationMessage = {
  dedupeKey?: string;
  template?: string;
  to: string;
  subject?: string;
  body?: string;
  orderId?: string;
};

@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    if (!process.env.KAFKA_BROKERS) {
      return;
    }

    try {
      await this.kafkaService.subscribe(KAFKA_TOPICS.NOTIFICATION_EMAIL, async (messages) => {
        for (const message of messages) {
          try {
            const raw = Buffer.isBuffer(message.value)
              ? message.value.toString()
              : String(message.value);
            const payload = JSON.parse(raw) as NotificationMessage;

            await this.notificationService.send({
              dedupeKey: payload.dedupeKey ?? `kafka:${randomUUID()}`,
              template: payload.template ?? 'generic',
              to: payload.to,
              subject: payload.subject ?? 'Уведомление',
              body: payload.body,
              orderId: payload.orderId,
            });
          } catch (error) {
            this.logger.error(
              `Failed to process notification message: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      });
      this.logger.log(`Subscribed to ${KAFKA_TOPICS.NOTIFICATION_EMAIL}`);
    } catch (error) {
      this.logger.error(
        `Failed to subscribe to notifications topic: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
