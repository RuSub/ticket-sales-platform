import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MetricsMiddleware.name);
  private readonly metrics = new Map<string, { count: number; totalDuration: number; errors: number }>();

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const key = `${req.method} ${req.route?.path || req.path}`;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const existing = this.metrics.get(key) || { count: 0, totalDuration: 0, errors: 0 };
      existing.count++;
      existing.totalDuration += duration;
      if (res.statusCode >= 400) existing.errors++;
      this.metrics.set(key, existing);

      this.logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });

    next();
  }

  getMetrics() {
    const result: Record<string, any> = {};
    for (const [key, data] of this.metrics) {
      result[key] = {
        ...data,
        avgDuration: Math.round(data.totalDuration / data.count),
        errorRate: (data.errors / data.count * 100).toFixed(2) + '%',
      };
    }
    return result;
  }
}
