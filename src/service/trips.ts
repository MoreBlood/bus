// Бортжурнал: поездки за год, итоги, разрывы одометра; добавление и правка записей.
import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { members, type Trip, trips } from '../db/schema.ts';
import { badRequest, notFound } from './errors.ts';
import { DATE, type JournalSummary, lastOdometer, type OdometerIssue, odometerIssues, summarize } from './journal.ts';
import { parse, type Viewer } from './members.ts';

const MAX_TRIP_KM = 10_000;
const MAX_TRIP_DAYS = 90;

const isoDate = z
  .string()
  .regex(DATE, 'Дата в формате ГГГГ-ММ-ДД')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Такой даты нет');
const odo = z.number().int('Одометр — целые км').min(0).max(9_999_999);

const tripInput = z
  .object({
    date: isoDate,
    endDate: isoDate.nullish(),
    /** null — общая поездка */
    memberId: z.string().min(1).nullable(),
    odoStart: odo.nullish(),
    odoEnd: odo.nullish(),
    km: z.number().int('Пробег — целые км').positive('Пробег больше нуля').max(MAX_TRIP_KM).nullish(),
    note: z.string().trim().max(300, 'Заметка длиннее 300 символов').default(''),
  })
  .transform((t, ctx) => {
    const endDate = t.endDate && t.endDate !== t.date ? t.endDate : null;
    if (endDate && endDate < t.date) ctx.addIssue({ code: 'custom', message: 'Возвращение раньше выезда' });
    if (endDate && (Date.parse(endDate) - Date.parse(t.date)) / 86_400_000 > MAX_TRIP_DAYS)
      ctx.addIssue({ code: 'custom', message: `Поездка дольше ${MAX_TRIP_DAYS} дней — разбейте на несколько записей` });
    const byOdo = t.odoStart != null || t.odoEnd != null;
    if (byOdo) {
      if (t.odoStart == null || t.odoEnd == null) {
        ctx.addIssue({ code: 'custom', message: 'Нужны оба показания одометра — до и после' });
        return z.NEVER;
      }
      const km = t.odoEnd - t.odoStart;
      if (km <= 0) ctx.addIssue({ code: 'custom', message: 'Одометр после должен быть больше, чем до' });
      if (km > MAX_TRIP_KM) ctx.addIssue({ code: 'custom', message: `Больше ${MAX_TRIP_KM} км за поездку — проверьте показания` });
      return { ...t, endDate, km, odoStart: t.odoStart, odoEnd: t.odoEnd };
    }
    if (t.km == null) {
      ctx.addIssue({ code: 'custom', message: 'Укажите пробег: по одометру или километрами' });
      return z.NEVER;
    }
    return { ...t, endDate, km: t.km, odoStart: null, odoEnd: null };
  });

export type TripInput = z.input<typeof tripInput>;

export interface Journal {
  year: string;
  /** годы, за которые есть записи, плюс текущий — для выбора года */
  years: string[];
  /** поездки года, новые сверху */
  trips: Trip[];
  summary: JournalSummary;
  /** разрывы и пересечения одометра, относящиеся к этому году */
  issues: OdometerIssue[];
  /** последнее показание одометра за всё время — подставляется в новую поездку */
  lastOdometer: { km: number; date: string } | null;
}

export const currentYear = () => new Date().toISOString().slice(0, 4);

export async function journal(db: Db, year = currentYear()): Promise<Journal> {
  if (!/^\d{4}$/.test(year)) throw badRequest('Год — четыре цифры');
  // поездок у одного буса немного (сотни в год) — считаем всё в памяти
  const all = await db.select().from(trips).orderBy(desc(trips.date), desc(trips.createdAt));
  const inYear = all.filter((t) => t.date.startsWith(`${year}-`) || (t.endDate ?? '').startsWith(`${year}-`));
  const years = [...new Set([currentYear(), year, ...all.map((t) => t.date.slice(0, 4))])].sort().reverse();
  return {
    year,
    years,
    trips: inYear,
    summary: summarize(inYear, year),
    issues: odometerIssues(all).filter((i) => i.date.startsWith(`${year}-`)),
    lastOdometer: lastOdometer(all),
  };
}

export async function getTrip(db: Db, id: string) {
  const t = await db.select().from(trips).where(eq(trips.id, id)).get();
  if (!t) throw notFound('Поездка не найдена (возможно, её уже удалили)');
  return t;
}

async function assertMember(db: Db, memberId: string | null, forNew: boolean) {
  if (memberId === null) return;
  const m = await db.select().from(members).where(eq(members.id, memberId)).get();
  if (!m) throw badRequest('Нет такого участника');
  if (forNew && !m.active) throw badRequest(`${m.name} выбыл(а) — новые поездки на него не записываются`);
}

export async function createTrip(db: Db, v: Viewer, input: unknown) {
  const t = parse(tripInput, input);
  await assertMember(db, t.memberId, true);
  const id = randomUUID();
  await db.insert(trips).values({ id, ...t, createdBy: v.login });
  return { id };
}

const tripPatch = z.object({ id: z.string().min(1) }).passthrough();

export async function updateTrip(db: Db, v: Viewer, input: unknown) {
  const { id, ...rest } = parse(tripPatch, input);
  const old = await db.select().from(trips).where(eq(trips.id, id)).get();
  if (!old) throw notFound('Поездка не найдена (возможно, её уже удалили)');
  // правка — полная замена полей записи: так форма и MCP работают одинаково
  const t = parse(tripInput, {
    date: old.date,
    endDate: old.endDate,
    memberId: old.memberId,
    note: old.note,
    ...(old.odoStart != null ? { odoStart: old.odoStart, odoEnd: old.odoEnd } : { km: old.km }),
    ...rest,
  });
  if (t.memberId !== old.memberId) await assertMember(db, t.memberId, true);
  await db
    .update(trips)
    .set({ ...t, updatedBy: v.login, updatedAt: new Date().toISOString() })
    .where(eq(trips.id, id));
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
    version: 1,
    exportedAt: new Date().toISOString(),
    members: await db.select().from(members).orderBy(asc(members.sort)),
    trips: await db.select().from(trips).orderBy(asc(trips.date)),
  };
}
