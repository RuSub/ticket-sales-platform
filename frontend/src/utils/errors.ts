import axios from 'axios';

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const message = data?.message;
    if (Array.isArray(message) && message.length > 0) {
      return message.join('; ');
    }
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (!error.response) {
      return 'Сервер недоступен. Проверьте, запущен ли backend.';
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
