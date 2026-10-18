import { Module } from '@nestjs/common';
import { ReturnService } from './return.service';
import { ReturnController } from './return.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Module({
  controllers: [ReturnController],
  providers: [ReturnService, AuditLogService, NotificationService],
  exports: [ReturnService],
})
export class ReturnModule {}
