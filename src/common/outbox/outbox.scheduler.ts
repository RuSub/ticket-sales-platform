import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxPublisher } from './outbox.publisher';

@Injectable()
export class OutboxScheduler {
  private readonly logger = new Logger(OutboxScheduler.name);
  private running = false;

  constructor(private readonly outboxPublisher: OutboxPublisher) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async flush() {
    // Without a configured broker the outbox keeps accumulating; publishing
    // would only spam connection errors, so the scheduler stays idle.
    if (!process.env.KAFKA_BROKERS || this.running) {
      return;
    }

    this.running = true;
    try {
      const published = await this.outboxPublisher.processPending();
      if (published > 0) {
        this.logger.log(`Published ${published} outbox event(s) to Kafka`);
      }
    } catch (error) {
      this.logger.error(
        `Outbox flush failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
