// Бортжурнал: поездки за год, итоги, разрывы одометра; добавление и правка записей.
import { randomUUID } from 'node:crypto';
import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Q } from '../db/index.ts';
import { members, refuels, type Trip, transfers, tripRiders, trips } from '../db/schema.ts';
import { demoMode } from '../env.ts';
import { badRequest, conflict, notFound } from './errors.ts';
import {
  type CostSettings,
  type FuelInterval,
  fuelIntervals,
  type MoneySummary,
  moneySummary,
  periodFor,
  type RatePeriod,
  type RiderLike,
  type TripCost,
  tripCost,
  type TripRates,
  tripRates,
} from './costs.ts';
import { DATE, type JournalSummary, lastOdometer, type OdometerIssue, odometerIssues, summarize } from './journal.ts';
import { getPeriods, getSettings } from './settings.ts';
import { parse, type Viewer } from './members.ts';

const MAX_TRIP_KM = 10_000;
const MAX_TRIP_DAYS = 90;
const MAX_GUESTS = 30;
/** превью PR открыто всем — не даём забить превью-базу мусором */
export const DEMO_MAX_TRIPS = 500;

const isoDate = z
  .string()
  .regex(DATE, 'Дата в формате ГГГГ-ММ-ДД')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Такой даты нет');
const odo = z.number().int('Одометр — целые км').min(0).max(9_999_999);

const rider = z.object({
  memberId: z.string().min(1),
  guests: z.number().int('Гостей — целое число').min(0).max(MAX_GUESTS, `Больше ${MAX_GUESTS} гостей — проверьте`).default(0),
  /** сам не ехал — бус отдан его гостям */
  absent: z.boolean().default(false),
});

const extrasInput = z.object({
  /** zł */
  amount: z.number().min(0).max(100_000, 'Слишком большая сумма — проверьте'),
  /** кто заплатил; null — вскладчину на месте */
  paidBy: z.string().min(1).nullable().default(null),
  note: z.string().trim().max(200).default(''),
});

const tripInput = z
  .object({
    date: isoDate,
    endDate: isoDate.nullish(),
    /** по делам буса: стоимость несёт общая касса */
    shared: z.boolean().optional(),
    /** кто ехал: владельцы и их гости */
    riders: z.array(rider).max(60).optional(),
    /** старый формат (одна строка «кто ехал»): null — общая поездка */
    memberId: z.string().min(1).nullish(),
    odoStart: odo.nullish(),
    odoEnd: odo.nullish(),
    km: z.number().int('Пробег — целые км').positive('Пробег больше нуля').max(MAX_TRIP_KM).nullish(),
    note: z.string().trim().max(300, 'Заметка длиннее 300 символов').default(''),
    /** платные дороги, парковки, паром */
    extras: extrasInput.nullish(),
  })
  .transform((t, ctx) => {
    const endDate = t.endDate && t.endDate !== t.date ? t.endDate : null;
    if (endDate && endDate < t.date) ctx.addIssue({ code: 'custom', message: 'Возвращение раньше выезда' });
    if (endDate && (Date.parse(endDate) - Date.parse(t.date)) / 86_400_000 > MAX_TRIP_DAYS)
      ctx.addIssue({ code: 'custom', message: `Поездка дольше ${MAX_TRIP_DAYS} дней — разбейте на несколько записей` });

    let riders = t.riders;
    let shared = t.shared;
    if (riders === undefined && t.memberId !== undefined) {
      riders = t.memberId ? [{ memberId: t.memberId, guests: 0, absent: false }] : [];
      shared ??= t.memberId === null;
    }
    riders ??= [];
    shared ??= false;
    if (new Set(riders.map((r) => r.memberId)).size !== riders.length)
      ctx.addIssue({ code: 'custom', message: 'Участник указан дважды' });
    if (!shared && riders.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Выберите, кто ехал, или отметьте поездку по делам буса' });
    if (riders.some((r) => r.absent && r.guests === 0))
      ctx.addIssue({ code: 'custom', message: 'Если владелец сам не ехал, добавьте его гостей — иначе в поездке никого нет' });

    const ex = t.extras && t.extras.amount > 0 ? t.extras : null;
    const base = {
      date: t.date,
      endDate,
      shared,
      riders,
      note: t.note,
      extrasAmount: ex ? Math.round(ex.amount * 100) : 0,
      extrasPaidBy: ex ? ex.paidBy : null,
      extrasNote: ex ? ex.note : '',
    };
    const byOdo = t.odoStart != null || t.odoEnd != null;
    if (byOdo) {
      if (t.odoStart == null || t.odoEnd == null) {
        ctx.addIssue({ code: 'custom', message: 'Нужны оба показания одометра — до и после' });
        return z.NEVER;
      }
      const km = t.odoEnd - t.odoStart;
      if (km <= 0) ctx.addIssue({ code: 'custom', message: 'Одометр после должен быть больше, чем до' });
      if (km > MAX_TRIP_KM) ctx.addIssue({ code: 'custom', message: `Больше ${MAX_TRIP_KM} км за поездку — проверьте показания` });
      return { ...base, km, odoStart: t.odoStart, odoEnd: t.odoEnd };
    }
    if (t.km == null) {
      ctx.addIssue({ code: 'custom', message: 'Укажите пробег: по одометру или километрами' });
      return z.NEVER;
    }
    return { ...base, km: t.km, odoStart: null, odoEnd: null };
  });

export type TripInput = z.input<typeof tripInput>;

/** Поездка для экрана: без устаревшей колонки, с участниками, расходами (zł) и стоимостью. */
export type TripView = Omit<Trip, 'memberId' | 'extrasAmount' | 'extrasPaidBy' | 'extrasNote'> & {
  riders: RiderLike[];
  extras: { amount: number; paidBy: string | null; note: string } | null;
  cost: TripCost;
};

export interface Journal {
  year: string;
  /** годы, за которые есть записи, плюс текущий — для выбора года */
  years: string[];
  /** поездки года, новые сверху */
  trips: TripView[];
  summary: JournalSummary & MoneySummary;
  /** ставки на сегодня — для предпросмотра новой поездки */
  rates: TripRates;
  settings: CostSettings;
  periods: RatePeriod[];
  /** разрывы и пересечения одометра, относящиеся к этому году */
  issues: OdometerIssue[];
  /** последнее показание одометра за всё время — подставляется в новую поездку */
  lastOdometer: { km: number; date: string } | null;
}

export const currentYear = () => new Date().toISOString().slice(0, 4);

export const inYearOf = (year: string) => (t: { date: string; endDate: string | null }) =>
  t.date.startsWith(`${year}-`) || (t.endDate ?? '').startsWith(`${year}-`);

/** Все поездки с участниками (новые сверху). */
export async function tripsWithRiders(db: Q) {
  const all = await db.select().from(trips).orderBy(desc(trips.date), desc(trips.createdAt));
  const rows = await db.select().from(tripRiders);
  const by = new Map<string, RiderLike[]>();
  for (const r of rows)
    by.set(r.tripId, [...(by.get(r.tripId) ?? []), { memberId: r.memberId, guests: r.guests, absent: r.absent }]);
  return all.map(({ memberId: _legacy, extrasAmount, extrasPaidBy, extrasNote, ...t }) => ({
    ...t,
    riders: by.get(t.id) ?? [],
    extras: extrasAmount ? { amount: extrasAmount / 100, paidBy: extrasPaidBy, note: extrasNote } : null,
  }));
}

/** Всё, от чего зависят деньги: режим и тип топлива, периоды ставок, отрезки между полными баками. */
export async function costContext(db: Q) {
  const [settings, periods, fuel] = await Promise.all([getSettings(db), getPeriods(db), db.select().from(refuels)]);
  const intervals: FuelInterval[] = fuelIntervals(fuel.map((r) => ({ ...r, amount: r.amount / 100 })));
  const ratesOf = (t: { date: string; odoStart: number | null; odoEnd: number | null }) => tripRates(t, periods, settings, intervals);
  return { settings, periods, intervals, ratesOf };
}

type WithRiders = Awaited<ReturnType<typeof tripsWithRiders>>[number];
export const withCost = (t: WithRiders, ratesOf: (t: WithRiders) => TripRates, year?: string) => ({
  ...t,
  cost: tripCost({ ...t, extras: t.extras?.amount ?? 0 }, ratesOf(t), year),
});

/** Стоимость км, которые никто не записал (разрывы одометра года), — по ставке периода разрыва. */
export function unrecordedCost(issues: OdometerIssue[], ctx: Awaited<ReturnType<typeof costContext>>) {
  let km = 0;
  let cost = 0;
  for (const i of issues)
    if (i.kind === 'gap') {
      const r = ctx.ratesOf({ date: i.date, odoStart: i.fromOdo, odoEnd: i.toOdo });
      km += i.km;
      cost += i.km * (r.amortPerKm + r.fuelPerKm);
    }
  return { km, cost };
}

export async function journal(db: Db, year = currentYear()): Promise<Journal> {
  if (!/^\d{4}$/.test(year)) throw badRequest('Год — четыре цифры');
  // поездок у одного буса немного (сотни в год) — считаем всё в памяти
  const all = await tripsWithRiders(db);
  const ctx = await costContext(db);
  const inYear = all.filter(inYearOf(year)).map((t) => withCost(t, ctx.ratesOf, year));
  const years = [...new Set([currentYear(), year, ...all.map((t) => t.date.slice(0, 4))])].sort().reverse();
  const issues = odometerIssues(all).filter((i) => i.date.startsWith(`${year}-`));
  const today = new Date().toISOString().slice(0, 10);
  return {
    year,
    years,
    trips: inYear,
    summary: {
      ...summarize(inYear),
      ...moneySummary(
        inYear.map((t) => ({ ...t, extras: t.extras?.amount ?? 0 })),
        unrecordedCost(issues, ctx),
      ),
    },
    rates: ctx.ratesOf({ date: today, odoStart: null, odoEnd: null }),
    settings: ctx.settings,
    periods: ctx.periods,
    issues,
    lastOdometer: lastOdometer(all),
  };
}

export async function getTrip(db: Db, id: string): Promise<TripView> {
  const t = (await tripsWithRiders(db)).find((x) => x.id === id);
  if (!t) throw notFound('Поездка не найдена (возможно, её уже удалили)');
  const ctx = await costContext(db);
  return withCost(t, ctx.ratesOf, t.date.slice(0, 4));
}

export { periodFor };

/** Участники должны существовать; на новые поездки — только действующие. */
async function assertRiders(db: Q, riders: RiderLike[], keep: Set<string> = new Set()) {
  if (!riders.length) return;
  const rows = await db.select().from(members).where(
    inArray(
      members.id,
      riders.map((r) => r.memberId),
    ),
  );
  for (const r of riders) {
    const m = rows.find((x) => x.id === r.memberId);
    if (!m) throw badRequest('Нет такого участника');
    if (!m.active && !keep.has(m.id)) throw badRequest(`${m.name} выбыл(а) — новые поездки на него не записываются`);
  }
}

export async function createTrip(db: Db, v: Viewer, input: unknown) {
  const { riders, ...t } = parse(tripInput, input);
  if (demoMode() && ((await db.select({ n: count() }).from(trips).get())?.n ?? 0) >= DEMO_MAX_TRIPS)
    throw conflict(`В демо уже ${DEMO_MAX_TRIPS} поездок — это предел превью`);
  await assertRiders(db, riders);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(trips).values({ id, ...t, createdBy: v.login });
    if (riders.length) await tx.insert(tripRiders).values(riders.map((r) => ({ tripId: id, ...r })));
  });
  return { id };
}

const tripPatch = z.object({ id: z.string().min(1) }).passthrough();

export async function updateTrip(db: Db, v: Viewer, input: unknown) {
  const { id, ...rest } = parse(tripPatch, input);
  const old = (await tripsWithRiders(db)).find((x) => x.id === id);
  if (!old) throw notFound('Поездка не найдена (возможно, её уже удалили)');
  // правка — полная замена полей записи: так форма и MCP работают одинаково
  const { riders, ...t } = parse(tripInput, {
    date: old.date,
    endDate: old.endDate,
    shared: old.shared,
    riders: old.riders,
    note: old.note,
    extras: old.extras,
    ...(old.odoStart != null ? { odoStart: old.odoStart, odoEnd: old.odoEnd } : { km: old.km }),
    ...(rest.memberId !== undefined && rest.riders === undefined ? { riders: undefined, shared: undefined } : {}),
    ...rest,
  });
  await assertRiders(db, riders, new Set(old.riders.map((r) => r.memberId)));
  await db.transaction(async (tx) => {
    await tx
      .update(trips)
      .set({ ...t, updatedBy: v.login, updatedAt: new Date().toISOString() })
      .where(eq(trips.id, id));
    await tx.delete(tripRiders).where(eq(tripRiders.tripId, id));
    if (riders.length) await tx.insert(tripRiders).values(riders.map((r) => ({ tripId: id, ...r })));
  });
  return { ok: true };
}

export async function deleteTrip(db: Db, _v: Viewer, id: unknown) {
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  const r = await db.delete(trips).where(eq(trips.id, id)).returning({ id: trips.id });
  if (!r.length) throw notFound('Поездка не найдена (возможно, её уже удалили)');
  return { ok: true };
}

/** Все данные для переноса и резервной копии. */
export async function exportData(db: Db) {
  return {
    format: 'bus-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(db),
    members: await db.select().from(members).orderBy(asc(members.sort)),
    trips: (await tripsWithRiders(db)).reverse(),
    refuels: await db.select().from(refuels).orderBy(asc(refuels.date)),
    transfers: await db.select().from(transfers).orderBy(asc(transfers.date)),
  };
}
