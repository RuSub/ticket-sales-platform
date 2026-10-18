import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, AuditLogService, NotificationService],
  exports: [OrderService],
})
export class OrderModule {}
