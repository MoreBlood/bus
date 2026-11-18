// Числа и даты по-русски. Пробег — целые км с неразрывным пробелом между разрядами.

const int = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** 181500 → «181 500» */
export const num = (n: number) => int.format(n);

/** 181500 → «181 500 км» */
export const km = (n: number) => `${int.format(n)} км`;

const dayMonth = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const full = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const utc = (d: string) => new Date(`${d}T00:00:00Z`);

/** «14 нояб.» → «14 нояб» (без точки сокращения — чище в строках). */
export const shortDate = (d: string) => dayMonth.format(utc(d)).replace('.', '');

export const longDate = (d: string) => full.format(utc(d)).replace(' г.', '');

/** Диапазон поездки: «2–3 нояб», «31 окт – 2 нояб». */
export function dateRange(from: string, to: string | null) {
  if (!to || to === from) return shortDate(from);
  const [a, b] = [shortDate(from), shortDate(to)];
  const [ad, am] = a.split(' ');
  const [bd, bm] = b.split(' ');
  return am === bm ? `${ad}–${bd} ${bm}` : `${a} – ${b}`;
}

/** Сегодня по местному времени в формате YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Число дней поездки включительно. */
export const tripDays = (from: string, to: string | null) =>
  to ? Math.max(1, Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1) : 1;

/** «1 день», «2 дня», «5 дней». */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
export const daysShort = (n: number) => `${n} дн`;
