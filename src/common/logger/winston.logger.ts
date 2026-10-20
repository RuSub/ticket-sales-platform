import { Injectable, LoggerService } from '@nestjs/common';
import winston from 'winston';
import { getLogContext } from './log-context';

const contextFormat = winston.format((info) => {
  const context = getLogContext();
  if (context?.traceId) {
    info.traceId = context.traceId;
  }
  if (context?.userId) {
    info.userId = context.userId;
  }
  return info;
});

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const transports: winston.transport[] = [new winston.transports.Console()];

    // File logs are opt-in: the container image does not create logs/ by default.
    if (process.env.LOG_TO_FILE === 'true') {
      transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
      transports.push(
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      );
    }

    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        contextFormat(),
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports,
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }
}
