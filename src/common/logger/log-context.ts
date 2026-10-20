import { AsyncLocalStorage } from 'node:async_hooks';

export type LogContext = {
  traceId: string;
  userId?: string;
};

export const logStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext | undefined {
  return logStorage.getStore();
}
