import { Module } from '@nestjs/common';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { SearchController } from '../search/search.controller';
import { SearchService } from '../search/search.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

@Module({
  // SearchController is registered before EventController so that
  // GET /events/search is not swallowed by GET /events/:id.
  controllers: [SearchController, EventController],
  providers: [EventService, SearchService, AuditLogService],
  exports: [EventService],
})
export class EventModule {}
