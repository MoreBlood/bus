// Деньги буса: кто сколько должен за амортизацию, топливо и расходы поездок; заправки, ремонты, переводы, ставки.
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { members, type Refuel, type Repair, refuels, repairs, type Transfer, transfers } from '../db/schema.ts';
import {
  type CostSettings,
  type FuelAccount,
  type FuelInterval,
  fuelUsed,
  ledger,
  type MoneySummary,
  moneySummary,
  type RatePeriod,
  type RepairKind,
  type RepairSplit,
  type Reserve,
  repairShares,
  type Settlement,
  type TripRates,
} from './costs.ts';
import { badRequest, notFound } from './errors.ts';
import { DATE, odometerIssues } from './journal.ts';
import { ownerOn, parse, type Viewer } from './members.ts';
import { costContext, currentYear, inYearOf, tripsWithRiders, unrecordedCost, withCost } from './trips.ts';

export interface Money {
  year: string;
  years: string[];
  settings: CostSettings;
  periods: RatePeriod[];
  /** ставки на сегодня и откуда они */
  rates: TripRates;
  summary: MoneySummary;
  /** кто кому должен: топливо (в учёте заправок), ремонты, переводы; null — делить нечего */
  ledger: { accounts: FuelAccount[]; settlements: Settlement[] } | null;
  /** доли ремонтов года по владельцам */
  repairsByMember: { memberId: string; amount: number }[];
  /** резерв на ремонт на сегодня: начислено амортизацией, ушло на ремонты, осталось */
  reserve: Reserve;
  /** ремонты за последние 12 месяцев на км — чтобы сверить ставку амортизации */
  fact: { from: string; km: number; spent: number; perKm: number | null };
  repairs: (Omit<Repair, 'amount' | 'kind'> & { amount: number; kind: RepairKind; split: RepairSplit | null })[];
  /** отрезки между полными баками этого года */
  intervals: FuelInterval[];
  refuels: (Omit<Refuel, 'amount'> & { amount: number })[];
  transfers: (Omit<Transfer, 'amount'> & { amount: number })[];
}

const zl = (grosze: number) => grosze / 100;

export async function money(db: Db, year = currentYear()): Promise<Money> {
  if (!/^\d{4}$/.test(year)) throw badRequest('Год — четыре цифры');
  const all = await tripsWithRiders(db);
  const ctx = await costContext(db);
  const inYear = all.filter(inYearOf(year)).map((t) => withCost(t, ctx.ratesOf, year));
  const issues = odometerIssues(all).filter((i) => i.date.startsWith(`${year}-`));
  const summary = moneySummary(
    inYear.map((t) => ({ ...t, extras: t.extras?.amount ?? 0 })),
    unrecordedCost(issues, ctx),
  );
  const yearRefuels = (await db.select().from(refuels).orderBy(desc(refuels.date), desc(refuels.createdAt))).filter((r) =>
    r.date.startsWith(`${year}-`),
  );
  const yearTransfers = (await db.select().from(transfers).orderBy(desc(transfers.date), desc(transfers.createdAt))).filter(
    (t) => t.date.startsWith(`${year}-`),
  );
  const asZl = <T extends { amount: number }>(r: T) => ({ ...r, amount: zl(r.amount) });

  // ремонты: резерв считается по всей истории — износ копится годами
  const allRepairs = (await db.select().from(repairs).orderBy(desc(repairs.date), desc(repairs.createdAt))).map((r) => ({
    ...r,
    amount: zl(r.amount),
    kind: r.kind as RepairKind,
  }));
  // нехватку резерва делят те, кто был совладельцем в день ремонта
  const people = await db.select().from(members);
  const owners = (date: string) => people.filter((m) => ownerOn(m, date)).map((m) => m.id);
  const accruals = all
    .filter((t) => !t.shared)
    .flatMap((t) => withCost(t, ctx.ratesOf).cost.riders.map((r) => ({ date: t.date, memberId: r.memberId, amort: r.amort })));
  const { splits, reserve } = repairShares(accruals, allRepairs, owners);
  const yearRepairs = allRepairs.filter((r) => r.date.startsWith(`${year}-`)).map((r) => ({ ...r, split: splits.get(r.id) ?? null }));
  const repairsBy = new Map<string, number>();
  for (const r of yearRepairs) for (const sh of r.split?.shares ?? []) repairsBy.set(sh.memberId, (repairsBy.get(sh.memberId) ?? 0) + sh.amount);

  // ставка по факту: ремонты из резерва за 12 месяцев на все км за это время
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const factKm = all.filter((t) => t.date > from && t.date <= today).reduce((sum, t) => sum + t.km, 0);
  const factSpent = allRepairs
    .filter((r) => r.date > from && r.date <= today && r.kind !== 'upgrade' && !r.chargedTo)
    .reduce((sum, r) => sum + r.amount, 0);

  // долги: только то, что после отметки «рассчитались до» — старая история не превращается в долги
  const settled = ctx.settings.settledUntil ?? '';
  const open = (d: string) => d > settled;
  const refuelsMode = ctx.settings.fuelMode === 'refuels';
  const openTrips = inYear.filter((t) => open(t.date));
  const openRepairs = yearRepairs.filter((r) => open(r.date));
  const openTransfers = yearTransfers.filter((t) => open(t.date));
  const openSummary = moneySummary(
    openTrips.map((t) => ({ ...t, extras: t.extras?.amount ?? 0 })),
    unrecordedCost(
      issues.filter((i) => open(i.date)),
      ctx,
    ),
  );
  // кто что заплатил: заправки, расходы поездок, ремонты; «вскладчину на месте» — каждый оплатил свою долю сам
  const paid: { paidBy: string | null; amount: number }[] = refuelsMode
    ? yearRefuels.filter((r) => open(r.date)).map((r) => ({ paidBy: r.paidBy, amount: zl(r.amount) }))
    : [];
  for (const r of openRepairs) paid.push({ paidBy: r.paidBy, amount: r.amount });
  for (const t of refuelsMode ? openTrips : []) {
    if (!t.extras) continue;
    if (t.extras.paidBy !== null || t.shared) paid.push({ paidBy: t.extras.paidBy, amount: t.extras.amount });
    else for (const r of t.cost.riders) paid.push({ paidBy: r.memberId, amount: r.extras });
  }

  const years = [...new Set([currentYear(), year, ...all.map((t) => t.date.slice(0, 4)), ...yearRefuels.map((r) => r.date.slice(0, 4)), ...allRepairs.map((r) => r.date.slice(0, 4))])]
    .sort()
    .reverse();
  return {
    year,
    years,
    settings: ctx.settings,
    periods: ctx.periods,
    rates: ctx.ratesOf({ date: new Date().toISOString().slice(0, 10), odoStart: null, odoEnd: null }),
    summary,
    ledger:
      // год целиком до отметки — все рассчитались, считать нечего
      `${year}-12-31` > settled && (refuelsMode || openRepairs.length || openTransfers.length)
        ? ledger(
            [
              ...(refuelsMode ? fuelUsed(openSummary) : []),
              ...openRepairs.flatMap((r) => (r.split?.shares ?? []).map((sh) => ({ id: sh.memberId, amount: sh.amount }))),
            ],
            paid,
            openTransfers.map(asZl),
          )
        : null,
    repairsByMember: [...repairsBy].map(([memberId, amount]) => ({ memberId, amount: Math.round(amount * 100) / 100 })),
    reserve,
    fact: { from, km: factKm, spent: Math.round(factSpent * 100) / 100, perKm: factKm >= 500 ? factSpent / factKm : null },
    repairs: yearRepairs,
    intervals: ctx.intervals.filter((i) => i.toDate.startsWith(`${year}-`)),
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

export const refuelInput = z.object({
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
