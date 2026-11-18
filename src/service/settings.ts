// Настройки расчёта: режим и тип топлива (общие) и периоды ставок (с даты). Меняют админы.
import { randomUUID } from 'node:crypto';
import { asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Q } from '../db/index.ts';
import { ratePeriods, settings } from '../db/schema.ts';
import { type AmortBasis, type CostSettings, DEFAULT_PERIOD, DEFAULT_SETTINGS, type RatePeriod } from './costs.ts';
import { badRequest, conflict, forbidden } from './errors.ts';
import { DATE } from './journal.ts';
import { parse, type Viewer } from './members.ts';

const KEY = 'costs';

export async function getSettings(db: Q): Promise<CostSettings> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).get();
  const v = (row?.value as Partial<CostSettings> | undefined) ?? {};
  return { fuelMode: v.fuelMode ?? DEFAULT_SETTINGS.fuelMode, fuelType: v.fuelType ?? DEFAULT_SETTINGS.fuelType };
}

/** Периоды ставок по возрастанию даты; пока ни одного — ставки по умолчанию «с самого начала». */
export async function getPeriods(db: Q): Promise<RatePeriod[]> {
  const rows = await db.select().from(ratePeriods).orderBy(asc(ratePeriods.validFrom));
  if (!rows.length) return [DEFAULT_PERIOD];
  return rows.map((r) => ({ ...r, basis: (r.basis as AmortBasis | null) ?? null }));
}

const requireAdmin = (v: Viewer) => {
  if (!v.isAdmin) throw forbidden('Ставки меняют только админы');
};

const settingsInput = z.object({ fuelMode: z.enum(['rate', 'refuels']), fuelType: z.enum(['diesel', 'petrol', 'lpg', 'electric']) }).partial();

export async function saveSettings(db: Db, v: Viewer, body: unknown) {
  requireAdmin(v);
  const raw = (body ?? {}) as Record<string, unknown>;
  // совместимость: старые клиенты присылали ставки вместе с режимом — это новый период «с сегодня»
  if (raw.amortPerKm !== undefined || raw.fuelPer100 !== undefined || raw.fuelPrice !== undefined)
    await savePeriod(db, v, { amortPerKm: raw.amortPerKm, fuelPer100: raw.fuelPer100, fuelPrice: raw.fuelPrice });
  const next = { ...(await getSettings(db)), ...parse(settingsInput, { fuelMode: raw.fuelMode, fuelType: raw.fuelType }) };
  await db.insert(settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}

const basisInput = z.object({
  items: z.array(z.object({ label: z.string().trim().min(1).max(60), perYear: z.number().min(0).max(1_000_000) })).max(12),
  kmPerYear: z.number().positive('Пробег в год больше нуля').max(500_000),
});

const periodInput = z.object({
  validFrom: z.string().regex(DATE, 'Дата в формате ГГГГ-ММ-ДД').optional(),
  amortPerKm: z.number().min(0, 'Ставка не может быть отрицательной').max(10, 'Больше 10 zł за км — проверьте').optional(),
  fuelPer100: z.number().min(1, 'Расход от 1 на 100 км').max(100, 'Расход до 100 на 100 км').optional(),
  fuelPrice: z.number().min(0.1, 'Цена от 0,1 zł').max(30, 'Цена до 30 zł').optional(),
  basis: basisInput.nullish(),
});

/** Новый период ставок с даты (по умолчанию — с сегодня); если на эту дату уже есть — правка. */
export async function savePeriod(db: Db, v: Viewer, body: unknown) {
  requireAdmin(v);
  const b = parse(periodInput, body);
  const validFrom = b.validFrom ?? new Date().toISOString().slice(0, 10);
  const periods = await getPeriods(db);
  const base = periods.filter((p) => p.validFrom <= validFrom).at(-1) ?? periods[0];
  const row = {
    validFrom,
    amortPerKm: b.amortPerKm ?? base.amortPerKm,
    fuelPer100: b.fuelPer100 ?? base.fuelPer100,
    fuelPrice: b.fuelPrice ?? base.fuelPrice,
    basis: b.basis === undefined ? base.basis : b.basis,
    createdBy: v.login,
  };
  await db.transaction(async (tx) => {
    // ставки по умолчанию становятся настоящим первым периодом, иначе прошлые поездки поменяются
    if ((await tx.select({ n: count() }).from(ratePeriods).get())?.n === 0 && validFrom > DEFAULT_PERIOD.validFrom)
      await tx.insert(ratePeriods).values({ ...DEFAULT_PERIOD, id: randomUUID(), createdBy: null, createdAt: undefined });
    await tx
      .insert(ratePeriods)
      .values({ id: randomUUID(), ...row })
      .onConflictDoUpdate({ target: ratePeriods.validFrom, set: { ...row, createdAt: new Date().toISOString() } });
  });
  return { ok: true, validFrom };
}

export async function deletePeriod(db: Db, v: Viewer, id: unknown) {
  requireAdmin(v);
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  if (((await db.select({ n: count() }).from(ratePeriods).get())?.n ?? 0) <= 1) throw conflict('Нужен хотя бы один период ставок');
  await db.delete(ratePeriods).where(eq(ratePeriods.id, id));
  return { ok: true };
}
