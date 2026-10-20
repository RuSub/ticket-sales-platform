import { Injectable } from '@nestjs/common';

type RouteStats = {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
};

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly stats = new Map<string, RouteStats>();

  record(method: string, route: string, status: number, durationMs: number) {
    const key = `${method} ${route}`;
    const current = this.stats.get(key) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };

    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    if (status >= 500) {
      current.errors += 1;
    }

    this.stats.set(key, current);
  }

  /** Prometheus text exposition format (no external dependency). */
  render(): string {
    const lines: string[] = [];

    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of this.stats) {
      const [method, ...routeParts] = key.split(' ');
      lines.push(
        `http_requests_total{method="${method}",route="${this.escape(routeParts.join(' '))}"} ${value.count}`,
      );
    }

    lines.push('# HELP http_request_errors_total Total number of 5xx responses');
    lines.push('# TYPE http_request_errors_total counter');
    for (const [key, value] of this.stats) {
      const [method, ...routeParts] = key.split(' ');
      lines.push(
        `http_request_errors_total{method="${method}",route="${this.escape(routeParts.join(' '))}"} ${value.errors}`,
      );
    }

    lines.push('# HELP http_request_duration_ms_sum Sum of request durations in milliseconds');
    lines.push('# TYPE http_request_duration_ms_sum counter');
    for (const [key, value] of this.stats) {
      const [method, ...routeParts] = key.split(' ');
      lines.push(
        `http_request_duration_ms_sum{method="${method}",route="${this.escape(routeParts.join(' '))}"} ${value.totalMs}`,
      );
    }

    lines.push('# HELP http_request_duration_ms_max Max observed request duration in milliseconds');
    lines.push('# TYPE http_request_duration_ms_max gauge');
    for (const [key, value] of this.stats) {
      const [method, ...routeParts] = key.split(' ');
      lines.push(
        `http_request_duration_ms_max{method="${method}",route="${this.escape(routeParts.join(' '))}"} ${value.maxMs}`,
      );
    }

    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(3)}`);

    return `${lines.join('\n')}\n`;
  }

  private escape(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
