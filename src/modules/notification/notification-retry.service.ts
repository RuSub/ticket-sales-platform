import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '../../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationRetryService {
  private readonly logger = new Logger(NotificationRetryService.name);
  private running = false;

  constructor(private readonly notificationService: NotificationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async retryDue() {
    if (this.running) {
      return 0;
    }
    this.running = true;

    try {
      const due = await prisma.notificationDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        select: { id: true },
        take: 50,
      });

      for (const delivery of due) {
        try {
          await this.notificationService.attemptDelivery(delivery.id);
        } catch (error) {
          this.logger.error(
            `Retry for delivery ${delivery.id} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return due.length;
    } finally {
      this.running = false;
    }
  }
}
