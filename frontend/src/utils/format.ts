export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPrice(value: string | number): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString('ru-RU') : '0'} ₽`;
}

/** Minutes left until a reservation expires. */
export function formatExpiresIn(value: string): string {
  const msLeft = new Date(value).getTime() - Date.now();
  if (Number.isNaN(msLeft)) {
    return '—';
  }
  if (msLeft <= 0) {
    return 'истёк';
  }
  return `${Math.ceil(msLeft / 60_000)} мин`;
}
