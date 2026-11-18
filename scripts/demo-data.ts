// `npm run demo`: наполнить ЛОКАЛЬНУЮ базу вымышленными участниками и поездками — для разработки и скриншотов.
// Боевую базу (TURSO_DATABASE_URL) не трогает.
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import { connection, dbConfig } from '../src/db/index.ts';
import { members, trips } from '../src/db/schema.ts';
import { migrateAll } from '../src/migrate.ts';

const { url, local } = connection();
if (!local) throw new Error(`Демо-данные только для локальной базы, а сейчас ${url}`);
await migrateAll();
const db = drizzle({ client: createClient({ url }), ...dbConfig });
if (await db.select().from(members).limit(1).get()) {
  console.log('В базе уже есть участники — демо-данные не добавлены. Чистая база: rm -rf data/');
  process.exit(0);
}

const names = ['Миша', 'Аня', 'Дима', 'Оля', 'Костя', 'Лёша', 'Женя', 'Ваня', 'Саша'];
const ids = names.map(() => randomUUID());
await db.insert(members).values(names.map((name, i) => ({ id: ids[i], name, sort: i + 1, isAdmin: i === 0 })));

// [дата, конец, участник (индекс или null — общая), км или [до, после], заметка]
type Row = [string, string | null, number | null, number | [number, number], string];
const rows: Row[] = [
  ['2026-03-14', '2026-03-15', 0, [176020, 176412], 'Варшава → Закопане'],
  ['2026-04-05', null, null, [176412, 176455], 'Техосмотр, Пясечно'],
  ['2026-05-01', '2026-05-03', 1, [176455, 177310], 'Мазуры, озёра'],
  ['2026-06-12', null, 2, 64, 'Перевозка мебели'],
  ['2026-07-18', '2026-07-26', 0, [177374, 179714], 'Хорватия, отпуск'],
  ['2026-08-30', null, 3, [179714, 180124], 'Варшава → Познань'],
  ['2026-09-20', null, 4, [180124, 180404], 'Фестиваль под Лодзью'],
  ['2026-10-27', null, 2, [180404, 180470], 'Переезд друга'],
  ['2026-11-02', '2026-11-03', 1, [180470, 181153], 'Варшава → Гданьск и обратно'],
  ['2026-11-09', null, null, [181153, 181195], 'СТО в Пясечно, замена масла'],
  ['2026-11-14', null, 0, [181232, 181500], 'Варшава → Казимеж-Дольны'],
];
await db.insert(trips).values(
  rows.map(([date, endDate, m, dist, note]) => ({
    id: randomUUID(),
    date,
    endDate,
    memberId: m === null ? null : ids[m],
    km: Array.isArray(dist) ? dist[1] - dist[0] : dist,
    odoStart: Array.isArray(dist) ? dist[0] : null,
    odoEnd: Array.isArray(dist) ? dist[1] : null,
    note,
    createdBy: 'demo',
  })),
);
console.log(`Демо: ${names.length} участников, ${rows.length} поездок → ${url}`);
