// Деньги буса: кто сколько должен за амортизацию и бензин, заправки, переводы.
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { members, type Refuel, refuels, type Transfer, transfers } from '../db/schema.ts';
import { type CostSettings, type FuelAccount, fuelLedger, type MoneySummary, moneySummary, type Rates, type Settlement } from './costs.ts';
import { badRequest, notFound } from './errors.ts';
import { DATE } from './journal.ts';
import { parse, type Viewer } from './members.ts';
import { currentYear, tripsWithRiders, yearRates } from './trips.ts';

export interface Money {
  year: string;
  years: string[];
  settings: CostSettings;
  rates: Rates;
  summary: MoneySummary;
  /** учёт заправок: счета и предложенные переводы; null — режим «бак на бак» */
  fuel: { accounts: FuelAccount[]; settlements: Settlement[] } | null;
  /** фактический расход по заправкам года, л/100 км (если хватает данных) */
  consumption: number | null;
  refuels: (Omit<Refuel, 'amount'> & { amount: number })[];
  transfers: (Omit<Transfer, 'amount'> & { amount: number })[];
}

const zl = (grosze: number) => grosze / 100;

export async function money(db: Db, year = currentYear()): Promise<Money> {
  if (!/^\d{4}$/.test(year)) throw badRequest('Год — четыре цифры');
  const all = await tripsWithRiders(db);
  const inYear = all.filter((t) => t.date.startsWith(`${year}-`) || (t.endDate ?? '').startsWith(`${year}-`));
  const { settings, rates } = await yearRates(db, year, inYear);
  const summary = moneySummary(inYear, rates, year);
  const yearRefuels = (await db.select().from(refuels).orderBy(desc(refuels.date), desc(refuels.createdAt))).filter((r) =>
    r.date.startsWith(`${year}-`),
  );
  const yearTransfers = (await db.select().from(transfers).orderBy(desc(transfers.date), desc(transfers.createdAt))).filter(
    (t) => t.date.startsWith(`${year}-`),
  );
  const asZl = <T extends { amount: number }>(r: T) => ({ ...r, amount: zl(r.amount) });
  const liters = yearRefuels.reduce((s, r) => s + r.liters, 0);
  const km = inYear.reduce((s, t) => s + t.km, 0);
  const years = [...new Set([currentYear(), year, ...all.map((t) => t.date.slice(0, 4)), ...yearRefuels.map((r) => r.date.slice(0, 4))])]
    .sort()
    .reverse();
  return {
    year,
    years,
    settings,
    rates,
    summary,
    fuel:
      settings.fuelMode === 'refuels'
        ? fuelLedger(summary, yearRefuels.map(asZl), yearTransfers.map(asZl))
        : null,
    consumption: liters > 0 && km > 0 ? Math.round((liters / km) * 1000) / 10 : null,
    refuels: yearRefuels.map(asZl),
    transfers: yearTransfers.map(asZl),
  };
}

const isoDate = z.string().regex(DATE, 'Дата в формате ГГГГ-ММ-ДД');
const memberRef = z.string().min(1).nullable();
const money2 = z
  .number()
  .positive('Сумма больше нуля')
  .max(100_000, 'Слишком большая сумма — проверьте')
  .transform((v) => Math.round(v * 100));

const refuelInput = z.object({
  date: isoDate,
  odometer: z.number().int().min(0).max(9_999_999).nullish(),
  liters: z.number().positive('Литры больше нуля').max(500, 'Больше 500 л — проверьте'),
  amount: money2,
  /** null — заплатили из общей кассы */
  paidBy: memberRef,
  full: z.boolean().default(true),
  note: z.string().trim().max(300).default(''),
});

const transferInput = z
  .object({ date: isoDate, fromId: memberRef, toId: memberRef, amount: money2, note: z.string().trim().max(300).default('') })
  .refine((t) => t.fromId !== t.toId, 'Перевод самому себе');

async function assertMembers(db: Db, ids: (string | null)[]) {
  for (const id of ids)
    if (id && !(await db.select({ id: members.id }).from(members).where(eq(members.id, id)).get()))
      throw badRequest('Нет такого участника');
}

export async function getRefuel(db: Db, id: string) {
  const r = await db.select().from(refuels).where(eq(refuels.id, id)).get();
  if (!r) throw notFound('Заправка не найдена (возможно, её уже удалили)');
  return { ...r, amount: zl(r.amount) };
}

export async function createRefuel(db: Db, v: Viewer, body: unknown) {
  const r = parse(refuelInput, body);
  await assertMembers(db, [r.paidBy]);
  const id = randomUUID();
  await db.insert(refuels).values({ id, ...r, createdBy: v.login });
  return { id };
}

export async function updateRefuel(db: Db, v: Viewer, body: unknown) {
  const { id, ...rest } = parse(z.object({ id: z.string().min(1) }).passthrough(), body);
  const old = await getRefuel(db, id);
  const r = parse(refuelInput, { ...old, ...rest });
  await assertMembers(db, [r.paidBy]);
  await db
    .update(refuels)
    .set({ ...r, updatedBy: v.login, updatedAt: new Date().toISOString() })
    .where(eq(refuels.id, id));
  return { ok: true };
}

export async function deleteRefuel(db: Db, _v: Viewer, id: unknown) {
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  const r = await db.delete(refuels).where(eq(refuels.id, id)).returning({ id: refuels.id });
  if (!r.length) throw notFound('Заправка не найдена');
  return { ok: true };
}

export async function createTransfer(db: Db, v: Viewer, body: unknown) {
  const t = parse(transferInput, body);
  await assertMembers(db, [t.fromId, t.toId]);
  const id = randomUUID();
  await db.insert(transfers).values({ id, ...t, createdBy: v.login });
  return { id };
}

export async function deleteTransfer(db: Db, _v: Viewer, id: unknown) {
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  const r = await db.delete(transfers).where(eq(transfers.id, id)).returning({ id: transfers.id });
  if (!r.length) throw notFound('Перевод не найден');
  return { ok: true };
}
