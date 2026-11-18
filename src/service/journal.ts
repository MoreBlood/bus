// Расчёты по бортжурналу — чистые функции без базы (покрыты тестами в journal.test.ts).

/** Минимум полей поездки, нужный для расчётов. */
export interface TripLike {
  id: string;
  date: string;
  endDate: string | null;
  memberId: string | null;
  km: number;
  odoStart: number | null;
  odoEnd: number | null;
}

export interface MemberTotals {
  memberId: string;
  km: number;
  /** дни личного пользования: каждый календарный день считается один раз */
  days: number;
  trips: number;
}

export interface JournalSummary {
  totalKm: number;
  personalKm: number;
  sharedKm: number;
  trips: number;
  members: MemberTotals[];
}

/** Разрыв (gap) или пересечение (overlap) показаний одометра между двумя соседними поездками. */
export interface OdometerIssue {
  kind: 'gap' | 'overlap';
  /** поездка, после которой разрыв */
  afterId: string;
  /** поездка, перед которой разрыв */
  beforeId: string;
  fromOdo: number;
  toOdo: number;
  /** незаписанные км (для overlap — сколько км записано дважды) */
  km: number;
  /** дата поездки, перед которой разрыв: по ней разрыв относится к году */
  date: string;
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 86_400_000;
const toDay = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const fromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Все календарные дни поездки (от выезда до возвращения включительно). */
export function tripDays(t: Pick<TripLike, 'date' | 'endDate'>): string[] {
  const start = toDay(t.date);
  const end = t.endDate ? Math.max(start, toDay(t.endDate)) : start;
  const days: string[] = [];
  for (let d = start; d <= end; d++) days.push(fromDay(d));
  return days;
}

/** Итоги года: общий, личный и общий пробег, км и дни по участникам. Поездки — уже отфильтрованные по году. */
export function summarize(trips: TripLike[], year: string): JournalSummary {
  const byMember = new Map<string, { km: number; days: Set<string>; trips: number }>();
  let personalKm = 0;
  let sharedKm = 0;
  for (const t of trips) {
    if (t.memberId === null) {
      sharedKm += t.km;
      continue;
    }
    personalKm += t.km;
    let m = byMember.get(t.memberId);
    if (!m) byMember.set(t.memberId, (m = { km: 0, days: new Set(), trips: 0 }));
    m.km += t.km;
    m.trips += 1;
    // многодневная поездка через Новый год: в этот год идут только его дни
    for (const d of tripDays(t)) if (d.startsWith(`${year}-`)) m.days.add(d);
  }
  const members = [...byMember].map(([memberId, m]) => ({ memberId, km: m.km, days: m.days.size, trips: m.trips }));
  members.sort((a, b) => b.km - a.km || b.days - a.days);
  return { totalKm: personalKm + sharedKm, personalKm, sharedKm, trips: trips.length, members };
}

/**
 * Разрывы и пересечения одометра. Поездки с одометром выстраиваются по показаниям; если следующая
 * начинается дальше, чем кончилась предыдущая, — км между ними никто не записал. Поездки, записанные
 * километрами без одометра, датированные между соседями, закрывают разрыв на свои км.
 */
export function odometerIssues(trips: TripLike[]): OdometerIssue[] {
  const withOdo = trips
    .filter((t): t is TripLike & { odoStart: number; odoEnd: number } => t.odoStart !== null && t.odoEnd !== null)
    .sort((a, b) => a.odoStart - b.odoStart || a.date.localeCompare(b.date));
  const manual = trips.filter((t) => t.odoStart === null || t.odoEnd === null);
  const issues: OdometerIssue[] = [];
  for (let i = 1; i < withOdo.length; i++) {
    const a = withOdo[i - 1];
    const b = withOdo[i];
    const base = { afterId: a.id, beforeId: b.id, fromOdo: a.odoEnd, toOdo: b.odoStart, date: b.date };
    if (b.odoStart > a.odoEnd) {
      const covered = manual
        .filter((m) => m.date >= a.date && m.date <= b.date)
        .reduce((s, m) => s + m.km, 0);
      const km = b.odoStart - a.odoEnd - covered;
      if (km > 0) issues.push({ kind: 'gap', ...base, km });
    } else if (b.odoStart < a.odoEnd) {
      issues.push({ kind: 'overlap', ...base, km: a.odoEnd - b.odoStart });
    }
  }
  return issues;
}

/** Последнее известное показание одометра — подставляется в «одометр до» новой поездки. */
export function lastOdometer(trips: TripLike[]): { km: number; date: string } | null {
  let best: { km: number; date: string } | null = null;
  for (const t of trips) if (t.odoEnd !== null && (!best || t.odoEnd > best.km)) best = { km: t.odoEnd, date: t.endDate ?? t.date };
  return best;
}
