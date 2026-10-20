import { Module } from '@nestjs/common';
import { OrganizerController } from './organizer.controller';
import { AgencyController } from './agency.controller';
import { AdminController } from './admin.controller';
import { SupportController } from './support.controller';
import { EventModule } from '../event/event.module';
import { BookingModule } from '../booking/booking.module';
import { OrderModule } from '../order/order.module';
import { ReturnModule } from '../return/return.module';
import { AuditLogService } from '../../common/audit/audit-log.service';

@Module({
  imports: [EventModule, BookingModule, OrderModule, ReturnModule],
  controllers: [OrganizerController, AgencyController, AdminController, SupportController],
  providers: [AuditLogService],
})
export class DashboardModule {}
