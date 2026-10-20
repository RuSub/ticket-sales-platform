import { Global, Module } from '@nestjs/common';
import { DashboardGateway } from './dashboard.gateway';

@Global()
@Module({
  providers: [DashboardGateway],
  exports: [DashboardGateway],
})
export class RealtimeModule {}
