import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationRetryService } from './notification-retry.service';
import { NotificationConsumer } from '../../common/notifications/notification.consumer';
import { QRCodeService } from '../../common/qr/qr.service';
import { OutboxModule } from '../../common/outbox/outbox.module';

@Module({
  imports: [OutboxModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRetryService,
    NotificationConsumer,
    QRCodeService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
