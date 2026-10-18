import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, AuditLogService, NotificationService],
  exports: [PaymentService],
})
export class PaymentModule {}
