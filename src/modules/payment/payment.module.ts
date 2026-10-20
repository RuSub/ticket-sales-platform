import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QRCodeService } from '../../common/qr/qr.service';
import { RedisService } from '../../common/redis/redis.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, AuditLogService, NotificationService, RedisService, QRCodeService],
  exports: [PaymentService],
})
export class PaymentModule {}
