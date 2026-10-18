import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { NotificationService } from '../../modules/notification/notification.service';

@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private kafkaService: KafkaService,
    private notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    // Subscribe to notification email topic (non-blocking with timeout)
    setTimeout(() => {
      this.kafkaService.subscribe(KAFKA_TOPICS.NOTIFICATION_EMAIL, async (messages) => {
        for (const message of messages) {
          try {
            const eventData = JSON.parse(message.value.toString());
            await this.notificationService.sendEmail(
              eventData.to,
              eventData.subject,
              eventData.html,
            );
          } catch (error: any) {
            this.logger.error(`Failed to process notification: ${error.message}`);
          }
        }
      }).catch((err) => {
        this.logger.error(`Failed to subscribe to Kafka: ${err.message}`);
      });
    }, 2000);
  }
}
