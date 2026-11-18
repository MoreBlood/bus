// Превью-база: миграции, демо-данные и пересоздание, если схема разошлась с веткой.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'bus-migrate-'));
process.env.DB_PATH = join(dir, 'preview.sqlite');
for (const k of Object.keys(process.env)) if (k.endsWith('TURSO_DATABASE_URL')) delete process.env[k];

const { createClient } = await import('@libsql/client');
const { connection } = await import('./db/index.ts');
const { migrateAll } = await import('./migrate.ts');
const { DEMO_COUNTS } = await import('./db/demo.ts');

const count = async (sql: string) => {
  const c = createClient({ url: connection().url });
  try {
    return Number((await c.execute(sql)).rows[0][0]);
  } finally {
    c.close();
  }
};

after(() => rmSync(dir, { recursive: true, force: true }));

describe('превью-база', () => {
  it('пустая база получает схему и демо-данные', async () => {
    await migrateAll({ preview: true });
    assert.equal(await count('SELECT count(*) FROM members'), 9);
    assert.equal(await count('SELECT count(*) FROM trips'), DEMO_COUNTS.trips);
  });

  it('повторная сборка не дублирует демо-данные', async () => {
    await migrateAll({ preview: true });
    assert.equal(await count('SELECT count(*) FROM members'), 9);
  });

  it('чужая миграция в базе — база пересоздаётся с нуля', async () => {
    const c = createClient({ url: connection().url });
    await c.execute("INSERT INTO trips (id, date, km, note) VALUES ('extra', '2026-01-01', 5, 'из другой ветки')");
    await c.execute("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('hash-from-another-branch', 9999999999999)");
    c.close();
    await migrateAll({ preview: true });
    assert.equal(await count("SELECT count(*) FROM __drizzle_migrations WHERE hash = 'hash-from-another-branch'"), 0);
    assert.equal(await count("SELECT count(*) FROM trips WHERE id = 'extra'"), 0);
    assert.equal(await count('SELECT count(*) FROM trips'), DEMO_COUNTS.trips);
  });
});
