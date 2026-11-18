// Настройки расчёта: ставки амортизации и бензина, режим бензина. Меняют админы.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Q } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { type CostSettings, DEFAULT_SETTINGS } from './costs.ts';
import { forbidden } from './errors.ts';
import { parse, type Viewer } from './members.ts';

const KEY = 'costs';

export async function getSettings(db: Q): Promise<CostSettings> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).get();
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<CostSettings>) ?? {}) };
}

const input = z
  .object({
    amortPerKm: z.number().min(0, 'Ставка не может быть отрицательной').max(10, 'Больше 10 zł за км — проверьте'),
    fuelPer100: z.number().min(1, 'Расход от 1 л/100 км').max(50, 'Расход до 50 л/100 км'),
    fuelPrice: z.number().min(0.5, 'Цена литра от 0,5 zł').max(30, 'Цена литра до 30 zł'),
    fuelMode: z.enum(['rate', 'refuels']),
  })
  .partial();

export async function saveSettings(db: Db, v: Viewer, body: unknown) {
  if (!v.isAdmin) throw forbidden('Ставки меняют только админы');
  const next = { ...(await getSettings(db)), ...parse(input, body) };
  await db.insert(settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}
