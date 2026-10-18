import { Module } from '@nestjs/common';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';

@Module({
  controllers: [EventController],
  providers: [EventService, AuditLogService],
  exports: [EventService],
})
export class EventModule {}
