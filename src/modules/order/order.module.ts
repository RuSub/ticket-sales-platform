import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { RedisService } from '../../common/redis/redis.service';
import { QRCodeService } from '../../common/qr/qr.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, AuditLogService, RedisService, QRCodeService],
  exports: [OrderService],
})
export class OrderModule {}
