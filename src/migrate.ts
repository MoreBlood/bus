// Миграции базы (drizzle-kit: наши таблицы и таблицы Better Auth).
// Запускается при сборке на Vercel (`npm run build`) и при старте локального сервера.
// Продакшен — боевая база; превью PR — отдельная превью-база с демо-данными; прочие сборки базу не трогают.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Client, createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { seedDemo } from './db/demo.ts';
import { connection, dbConfig } from './db/index.ts';
import { demoMode } from './env.ts';

const MIGRATIONS = new URL('../drizzle', import.meta.url).pathname;

/**
 * Превью-база общая для всех PR. Если в ней применены миграции, которых нет в этой ветке (их принёс
 * другой PR), схема разошлась — пересоздаём базу с нуля. Данные там всё равно демо.
 */
export async function resetIfDrifted(client: Client) {
  const known = new Set(readMigrationFiles({ migrationsFolder: MIGRATIONS }).map((m) => m.hash));
  let applied: string[] = [];
  try {
    applied = (await client.execute('SELECT hash FROM __drizzle_migrations')).rows.map((r) => String(r.hash));
  } catch {
    return false; // пустая база
  }
  if (applied.every((h) => known.has(h))) return false;
  const tables = (
    await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  ).rows.map((r) => String(r.name));
  // внешние ключи мешают удалять родителей раньше детей — удаляем в несколько проходов
  let left = tables;
  for (let pass = 0; left.length && pass < tables.length + 1; pass++) {
    const failed: string[] = [];
    for (const t of left) await client.execute(`DROP TABLE IF EXISTS "${t.replace(/"/g, '""')}"`).catch(() => failed.push(t));
    left = failed;
  }
  if (left.length) throw new Error(`Не удалось очистить превью-базу: ${left.join(', ')}`);
  return true;
}

export async function migrateAll({ preview = false } = {}) {
  const { url, authToken, local } = connection();
  if (local) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  const client = createClient({ url, authToken });
  if (local) await client.execute('PRAGMA journal_mode = WAL');
  const db = drizzle({ client, ...dbConfig });
  if (preview && (await resetIfDrifted(client))) console.log('preview db: схема разошлась с веткой — пересоздана');
  await migrate(db, { migrationsFolder: MIGRATIONS });
  if (preview && (await seedDemo(db))) console.log('preview db: добавлены демо-данные');
  client.close();
}

if (import.meta.main ?? process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
    if (demoMode()) {
      if (connection().local) throw new Error('Превью без превью-базы: нужны TURSO_* для окружения Preview');
      await migrateAll({ preview: true });
      console.log('migrations: ok (preview db)');
    } else console.log(`migrations: skipped (VERCEL_ENV=${process.env.VERCEL_ENV})`);
    process.exit(0);
  }
  if (!process.env.VERCEL) {
    try {
      process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
    } catch {}
  }
  await migrateAll();
  console.log('migrations: ok');
}
