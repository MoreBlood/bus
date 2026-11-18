// Вымышленные участники и поездки — для локальной разработки (`npm run demo`) и превью PR на Vercel.
// Даты сдвигаются так, чтобы последняя поездка была несколько дней назад: демо всегда «свежее».
import { randomUUID } from 'node:crypto';
import type { Db } from './index.ts';
import { members, refuels, repairs, tripRiders, trips } from './schema.ts';

const NAMES = ['Миша', 'Аня', 'Дима', 'Оля', 'Костя', 'Лёша', 'Женя', 'Ваня', 'Саша'];

// [дата, конец, кто ехал ([участник, гостей, сам не ехал?]…; null — по делам буса), км или [до, после], заметка,
//  расходы в дороге [zł, кто платил (null — вскладчину), за что]]
type Who = [number, number, boolean?];
type Extras = [number, number | null, string];
type Row = [string, string | null, Who[] | null, number | [number, number], string, Extras?];
const ROWS: Row[] = [
  ['2026-03-14', '2026-03-15', [[0, 0]], [176020, 176412], 'Варшава → Закопане', [60, null, 'парковка']],
  ['2026-04-05', null, null, [176412, 176455], 'Техосмотр, Пясечно'],
  ['2026-05-01', '2026-05-03', [[1, 2], [3, 0]], [176455, 177310], 'Мазуры, озёра'],
  ['2026-06-12', null, [[2, 0]], 64, 'Перевозка мебели'],
  ['2026-07-18', '2026-07-26', [[0, 1], [1, 0], [4, 0]], [177374, 179714], 'Хорватия, отпуск', [380, 0, 'платные дороги']],
  ['2026-08-30', null, [[3, 0]], [179714, 180124], 'Варшава → Познань'],
  ['2026-09-20', null, [[4, 3]], [180124, 180404], 'Фестиваль под Лодзью'],
  ['2026-10-27', null, [[2, 0]], [180404, 180470], 'Переезд друга'],
  ['2026-10-31', null, [[3, 2, true]], 120, 'Друзья Оли на свадьбу'],
  ['2026-11-02', '2026-11-03', [[1, 0], [0, 0]], [180470, 181153], 'Варшава → Гданьск и обратно'],
  ['2026-11-09', null, null, [181153, 181195], 'СТО в Пясечно, замена масла'],
  ['2026-11-14', null, [[0, 2]], [181232, 181500], 'Варшава → Казимеж-Дольны'],
];

// [дата, кто платил (индекс; null — касса), литры, сумма zł, одометр, до полного?]
// Расход ~11 л/100 км, как у дизельного буса; одна заправка не до полного — она входит в следующий бак.
const REFUELS: [string, number | null, number, number, number, boolean][] = [
  ['2026-03-14', 0, 55, 358, 176020, true],
  ['2026-05-01', 1, 48, 312, 176460, true],
  ['2026-05-03', 3, 64, 416, 177050, true],
  ['2026-07-18', 0, 36, 236, 177380, true],
  ['2026-07-20', 4, 79, 529, 178100, true],
  ['2026-07-23', 1, 80, 548, 178850, true],
  ['2026-07-26', 0, 81, 540, 179600, true],
  ['2026-09-20', 4, 57, 371, 180130, true],
  ['2026-11-02', 1, 30, 196, 180700, false],
  ['2026-11-09', null, 81, 527, 181160, true],
];
// [дата, тип, что сделали, сумма zł, кто платил (null — касса), одометр, по чьей вине]
type RepairRow = [string, 'service' | 'repair' | 'tires' | 'other' | 'upgrade', string, number, number | null, number, number?];
const REPAIRS: RepairRow[] = [
  ['2026-04-05', 'service', 'Техосмотр, масло и фильтры', 1150, 0, 176440],
  ['2026-08-02', 'repair', 'Отвалился патрубок интеркулера', 480, 4, 179760],
  ['2026-09-01', 'upgrade', 'Бокс на крышу', 1400, 1, 180124],
  ['2026-10-12', 'repair', 'Подвеска: стойки стабилизатора и сайлентблоки', 1900, null, 180430],
  ['2026-10-28', 'other', 'Разбитое зеркало', 260, 2, 180470, 2],
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
    ROWS.map(([date, endDate, who, dist, note, extras], i) => ({
      id: tripIds[i],
      date: shift(date, offset),
      endDate: endDate && shift(endDate, offset),
      shared: who === null,
      km: Array.isArray(dist) ? dist[1] - dist[0] : dist,
      odoStart: Array.isArray(dist) ? dist[0] : null,
      odoEnd: Array.isArray(dist) ? dist[1] : null,
      note,
      extrasAmount: extras ? extras[0] * 100 : 0,
      extrasPaidBy: extras && extras[1] !== null ? ids[extras[1]] : null,
      extrasNote: extras ? extras[2] : '',
      createdBy: 'demo',
    })),
  );
  await db.insert(tripRiders).values(
    ROWS.flatMap(([, , who], i) =>
      (who ?? []).map(([m, guests, absent]) => ({ tripId: tripIds[i], memberId: ids[m], guests, absent: !!absent })),
    ),
  );
  await db.insert(refuels).values(
    REFUELS.map(([date, who, liters, zl, odometer, full]) => ({
      id: randomUUID(),
      date: shift(date, offset),
      paidBy: who === null ? null : ids[who],
      liters,
      amount: zl * 100,
      odometer,
      full,
      createdBy: 'demo',
    })),
  );
  await db.insert(repairs).values(
    REPAIRS.map(([date, kind, title, zl, who, odometer, fault]) => ({
      id: randomUUID(),
      date: shift(date, offset),
      kind,
      title,
      amount: zl * 100,
      paidBy: who === null ? null : ids[who],
      chargedTo: fault === undefined ? null : ids[fault],
      odometer,
      createdBy: 'demo',
    })),
  );
  return true;
}

export const DEMO_COUNTS = { members: NAMES.length, trips: ROWS.length };
