// Заполнение истории пачкой — поездки, заправки, ремонты за прошлые годы. Сначала предпросмотр: что
// запишется, ошибки и возможные дубли по строкам, итоги по годам. Запись — одной пачкой: всё или ничего.
import { randomUUID } from 'node:crypto';
import { count } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { members, refuels, repairs, tripRiders, trips } from '../db/schema.ts';
import { demoMode } from '../env.ts';
import { badRequest, conflict } from './errors.ts';
import { ownerOn, parse, type Viewer } from './members.ts';
import { refuelInput } from './money.ts';
import { repairInput } from './repairs.ts';
import { DEMO_MAX_TRIPS, tripInput, tripsWithRiders } from './trips.ts';

const MAX_ROWS = 300;

const importInput = z.object({
  /** по умолчанию только предпросмотр — записывает лишь dryRun: false */
  dryRun: z.boolean().default(true),
  /** записать и строки, похожие на уже записанные */
  allowDuplicates: z.boolean().default(false),
  trips: z.array(z.unknown()).default([]),
  refuels: z.array(z.unknown()).default([]),
  repairs: z.array(z.unknown()).default([]),
});

export interface ImportRow {
  kind: 'trip' | 'refuel' | 'repair';
  /** номер строки в своём списке, с нуля */
  index: number;
  line: string;
  error?: string;
  duplicate?: boolean;
}

interface YearTotals {
  trips: number;
  km: number;
  refuels: number;
  repairs: number;
  /** заправки и ремонты, zł */
  spent: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось разобрать строку');
const zl = (grosze: number) => Math.round(grosze) / 100;

export async function importHistory(db: Db, v: Viewer, body: unknown) {
  const b = parse(importInput, body);
  const total = b.trips.length + b.refuels.length + b.repairs.length;
  if (!total) throw badRequest('Пусто: передайте trips, refuels или repairs');
  if (total > MAX_ROWS) throw badRequest(`За раз до ${MAX_ROWS} записей — разбейте на части (например, по годам)`);

  const people = new Map((await db.select().from(members)).map((m) => [m.id, m]));
  const known = (id: string | null) => {
    if (id && !people.has(id)) throw badRequest(`Нет участника ${id} — сверьтесь с list_members`);
  };
  const nameOf = (id: string | null) => (id ? (people.get(id)?.name ?? '?') : 'касса');
  const rows: ImportRow[] = [];
  const byYear = new Map<string, YearTotals>();
  const year = (d: string) => {
    const y = d.slice(0, 4);
    let t = byYear.get(y);
    if (!t) byYear.set(y, (t = { trips: 0, km: 0, refuels: 0, repairs: 0, spent: 0 }));
    return t;
  };

  // поездки
  const oldTrips = await tripsWithRiders(db);
  const tripKey = (t: { date: string; km: number; odoStart: number | null }) => `${t.date}|${t.odoStart ?? ''}|${t.km}`;
  const seenTrips = new Set(oldTrips.map(tripKey));
  const newTrips: (ReturnType<typeof tripInput.parse> & { id: string })[] = [];
  b.trips.forEach((raw, index) => {
    try {
      const t = parse(tripInput, raw);
      for (const r of t.riders) {
        known(r.memberId);
        const m = people.get(r.memberId);
        if (m && !ownerOn(m, t.date))
          throw badRequest(
            `${m.name} не совладелец на ${t.date}${m.joinedOn && t.date < m.joinedOn ? ` (совладелец с ${m.joinedOn})` : m.leftOn ? ` (выбыл(а) с ${m.leftOn})` : ''}`,
          );
      }
      known(t.extrasPaidBy);
      const who = t.shared ? 'по делам буса' : t.riders.map((r) => `${nameOf(r.memberId)}${r.guests ? ` +${r.guests}` : ''}`).join(', ');
      const line = `${t.date}${t.endDate ? `–${t.endDate}` : ''} · ${t.km} км · ${who}${t.note ? ` · ${t.note}` : ''}`;
      const duplicate = seenTrips.has(tripKey(t));
      seenTrips.add(tripKey(t));
      rows.push({ kind: 'trip', index, line, ...(duplicate && { duplicate }) });
      newTrips.push({ ...t, id: randomUUID() });
      const y = year(t.date);
      y.trips += 1;
      y.km += t.km;
    } catch (e) {
      rows.push({ kind: 'trip', index, line: '', error: message(e) });
    }
  });

  // заправки
  const refuelKey = (r: { date: string; amount: number; liters: number }) => `${r.date}|${r.amount}|${r.liters}`;
  const seenRefuels = new Set((await db.select().from(refuels)).map(refuelKey));
  const newRefuels: (ReturnType<typeof refuelInput.parse> & { id: string })[] = [];
  b.refuels.forEach((raw, index) => {
    try {
      const r = parse(refuelInput, raw);
      known(r.paidBy);
      const duplicate = seenRefuels.has(refuelKey(r));
      seenRefuels.add(refuelKey(r));
      rows.push({ kind: 'refuel', index, line: `${r.date} · ${r.liters} · ${zl(r.amount)} zł · ${nameOf(r.paidBy)}`, ...(duplicate && { duplicate }) });
      newRefuels.push({ ...r, id: randomUUID() });
      const y = year(r.date);
      y.refuels += 1;
      y.spent += zl(r.amount);
    } catch (e) {
      rows.push({ kind: 'refuel', index, line: '', error: message(e) });
    }
  });

  // ремонты
  const repairKey = (r: { date: string; amount: number; title: string }) => `${r.date}|${r.amount}|${r.title.toLowerCase()}`;
  const seenRepairs = new Set((await db.select().from(repairs)).map(repairKey));
  const newRepairs: (ReturnType<typeof repairInput.parse> & { id: string })[] = [];
  b.repairs.forEach((raw, index) => {
    try {
      const r = parse(repairInput, raw);
      known(r.paidBy);
      known(r.chargedTo);
      const duplicate = seenRepairs.has(repairKey(r));
      seenRepairs.add(repairKey(r));
      rows.push({ kind: 'repair', index, line: `${r.date} · ${r.title} · ${zl(r.amount)} zł · ${nameOf(r.paidBy)}`, ...(duplicate && { duplicate }) });
      newRepairs.push({ ...r, id: randomUUID() });
      const y = year(r.date);
      y.repairs += 1;
      y.spent += zl(r.amount);
    } catch (e) {
      rows.push({ kind: 'repair', index, line: '', error: message(e) });
    }
  });

  const errors = rows.filter((r) => r.error).length;
  const duplicates = rows.filter((r) => r.duplicate).length;
  const report = {
    rows,
    errors,
    duplicates,
    byYear: Object.fromEntries([...byYear].sort(([a], [b]) => a.localeCompare(b)).map(([y, t]) => [y, { ...t, spent: Math.round(t.spent) }])),
  };
  const blocked = errors > 0 || (duplicates > 0 && !b.allowDuplicates);
  if (b.dryRun || blocked)
    return {
      written: false,
      ...report,
      next: errors
        ? 'Исправьте строки с ошибками и пришлите снова'
        : duplicates && !b.allowDuplicates
          ? 'Есть строки, похожие на уже записанные: уберите их или подтвердите allowDuplicates'
          : 'Покажите пользователю сводку; записать — тот же запрос с dryRun: false',
    };

  if (demoMode() && ((await db.select({ n: count() }).from(trips).get())?.n ?? 0) + newTrips.length > DEMO_MAX_TRIPS)
    throw conflict(`В демо не больше ${DEMO_MAX_TRIPS} поездок — это предел превью`);
  // одной пачкой: если что-то не запишется, не запишется ничего
  const by = v.login;
  const queries = [
    ...newTrips.flatMap(({ id, riders, ...t }) => [
      db.insert(trips).values({ id, ...t, createdBy: by }),
      ...(riders.length ? [db.insert(tripRiders).values(riders.map((r) => ({ tripId: id, ...r })))] : []),
    ]),
    ...newRefuels.map((r) => db.insert(refuels).values({ ...r, createdBy: by })),
    ...newRepairs.map((r) => db.insert(repairs).values({ ...r, createdBy: by })),
  ];
  const [first, ...rest] = queries;
  if (first) await db.batch([first, ...rest]);
  return {
    written: true,
    ...report,
    counts: { trips: newTrips.length, refuels: newRefuels.length, repairs: newRepairs.length },
  };
}
