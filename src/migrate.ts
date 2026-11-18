// Миграции базы (drizzle-kit: наши таблицы и таблицы Better Auth).
// Запускается при сборке продакшена на Vercel (`npm run build`) и при старте локального сервера.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { connection, dbConfig } from './db/index.ts';

const MIGRATIONS = new URL('../drizzle', import.meta.url).pathname;

export async function migrateAll() {
  const { url, authToken, local } = connection();
  if (local) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  const client = createClient({ url, authToken });
  if (local) await client.execute('PRAGMA journal_mode = WAL');
  const db = drizzle({ client, ...dbConfig });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  client.close();
}

if (import.meta.main ?? process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
    // превью-сборки (PR друзей) не трогают боевую базу
    console.log(`migrations: skipped (VERCEL_ENV=${process.env.VERCEL_ENV})`);
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
