export const TIME_ZONE = 'Africa/Kigali';

export function todayCAT(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function daysFromTodayCAT(days: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + days * 86400000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatNowCAT(
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' }
): string {
  return new Intl.DateTimeFormat([], { timeZone: TIME_ZONE, ...opts }).format(new Date());
}

function parseCAT(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withOffset = normalized.length >= 16 ? `${normalized}+02:00` : normalized;
  const d = new Date(withOffset);
  return isNaN(d.getTime()) ? null : d;
}

export function formatTimeCAT(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
  const d = parseCAT(value);
  if (!d) return '-';
  return d.toLocaleTimeString([], opts);
}

export function formatDateCAT(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const d = parseCAT(value);
  if (!d) return '-';
  return d.toLocaleDateString([], opts);
}

export function formatDateTimeCAT(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
): string {
  const d = parseCAT(value);
  if (!d) return '-';
  return d.toLocaleString([], opts);
}
