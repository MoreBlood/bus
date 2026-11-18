// Вымышленные участники и поездки — для локальной разработки (`npm run demo`) и превью PR на Vercel.
// Даты сдвигаются так, чтобы последняя поездка была несколько дней назад: демо всегда «свежее».
import { randomUUID } from 'node:crypto';
import type { Db } from './index.ts';
import { members, refuels, tripRiders, trips } from './schema.ts';

const NAMES = ['Миша', 'Аня', 'Дима', 'Оля', 'Костя', 'Лёша', 'Женя', 'Ваня', 'Саша'];

// [дата, конец, кто ехал ([участник, гостей]…; null — по делам буса), км или [до, после], заметка]
type Row = [string, string | null, [number, number][] | null, number | [number, number], string];
const ROWS: Row[] = [
  ['2026-03-14', '2026-03-15', [[0, 0]], [176020, 176412], 'Варшава → Закопане'],
  ['2026-04-05', null, null, [176412, 176455], 'Техосмотр, Пясечно'],
  ['2026-05-01', '2026-05-03', [[1, 2], [3, 0]], [176455, 177310], 'Мазуры, озёра'],
  ['2026-06-12', null, [[2, 0]], 64, 'Перевозка мебели'],
  ['2026-07-18', '2026-07-26', [[0, 1], [1, 0], [4, 0]], [177374, 179714], 'Хорватия, отпуск'],
  ['2026-08-30', null, [[3, 0]], [179714, 180124], 'Варшава → Познань'],
  ['2026-09-20', null, [[4, 3]], [180124, 180404], 'Фестиваль под Лодзью'],
  ['2026-10-27', null, [[2, 0]], [180404, 180470], 'Переезд друга'],
  ['2026-11-02', '2026-11-03', [[1, 0], [0, 0]], [180470, 181153], 'Варшава → Гданьск и обратно'],
  ['2026-11-09', null, null, [181153, 181195], 'СТО в Пясечно, замена масла'],
  ['2026-11-14', null, [[0, 2]], [181232, 181500], 'Варшава → Казимеж-Дольны'],
];

// [дата, кто платил (индекс; null — касса), литры, сумма zł, одометр]
const REFUELS: [string, number | null, number, number, number][] = [
  ['2026-05-01', 1, 62, 403, 176460],
  ['2026-07-18', 0, 70, 469, 177380],
  ['2026-07-23', 4, 68, 452, 178600],
  ['2026-09-20', 4, 55, 363, 180130],
  ['2026-11-09', null, 48, 312, 181160],
];
const LAST = '2026-11-14';

const DAY = 86_400_000;
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Наполняет пустую базу демо-данными. Возвращает false, если участники уже есть. */
export async function seedDemo(db: Db, today = new Date()) {
  if (await db.select({ id: members.id }).from(members).limit(1).get()) return false;
  const lastTrip = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 4 * DAY;
  const offset = Math.round((lastTrip - Date.parse(`${LAST}T00:00:00Z`)) / DAY);
  const ids = NAMES.map(() => randomUUID());
  await db.insert(members).values(NAMES.map((name, i) => ({ id: ids[i], name, sort: i + 1, isAdmin: i === 0 })));
  const tripIds = ROWS.map(() => randomUUID());
  await db.insert(trips).values(
    ROWS.map(([date, endDate, who, dist, note], i) => ({
      id: tripIds[i],
      date: shift(date, offset),
      endDate: endDate && shift(endDate, offset),
      shared: who === null,
      km: Array.isArray(dist) ? dist[1] - dist[0] : dist,
      odoStart: Array.isArray(dist) ? dist[0] : null,
      odoEnd: Array.isArray(dist) ? dist[1] : null,
      note,
      createdBy: 'demo',
    })),
  );
  await db
    .insert(tripRiders)
    .values(ROWS.flatMap(([, , who], i) => (who ?? []).map(([m, guests]) => ({ tripId: tripIds[i], memberId: ids[m], guests }))));
  await db.insert(refuels).values(
    REFUELS.map(([date, who, liters, zl, odometer]) => ({
      id: randomUUID(),
      date: shift(date, offset),
      paidBy: who === null ? null : ids[who],
      liters,
      amount: zl * 100,
      odometer,
      full: true,
      createdBy: 'demo',
    })),
  );
  return true;
}

export const DEMO_COUNTS = { members: NAMES.length, trips: ROWS.length };
