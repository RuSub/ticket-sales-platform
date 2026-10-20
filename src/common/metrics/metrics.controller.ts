import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @SkipThrottle()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render() {
    return this.metricsService.render();
  }
}
