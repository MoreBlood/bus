// Регистрация OAuth-клиентов без входа: общий лимит в час и чистка брошенных клиентов.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'bus-dcr-'));
process.env.DB_PATH = join(dir, 'dcr.sqlite');
for (const k of Object.keys(process.env)) if (k.endsWith('TURSO_DATABASE_URL')) delete process.env[k];

const { createClient } = await import('@libsql/client');
const { drizzle } = await import('drizzle-orm/libsql/node');
const { count } = await import('drizzle-orm');
const { oauthClient, oauthConsent } = await import('../db/auth-schema.ts');
const { connection, dbConfig } = await import('../db/index.ts');
const { migrateAll } = await import('../migrate.ts');
const { guardClientRegistration, REGISTRATIONS_PER_HOUR } = await import('./oauth-clients.ts');

let client: ReturnType<typeof createClient>;
let db: ReturnType<typeof drizzle<typeof dbConfig.schema>>;
const HOUR = 3_600_000;
const now = Date.now();

const addClient = (id: string, ageMs: number) =>
  db.insert(oauthClient).values({ id, clientId: id, redirectUris: ['https://evil.example/cb'], createdAt: new Date(now - ageMs) });
const total = async () => (await db.select({ n: count() }).from(oauthClient).get())?.n ?? 0;

before(async () => {
  await migrateAll();
  client = createClient({ url: connection().url });
  db = drizzle({ client, ...dbConfig });
});

after(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('регистрация OAuth-клиентов', () => {
  it('брошенные клиенты старше суток удаляются, с согласием — остаются', async () => {
    await addClient('stale', 30 * HOUR);
    await addClient('in-use', 30 * HOUR);
    await db.insert(oauthConsent).values({ id: 'c1', clientId: 'in-use', scopes: ['openid'] });
    await guardClientRegistration(db, now);
    const ids = (await db.select({ id: oauthClient.id }).from(oauthClient)).map((r) => r.id);
    assert.deepEqual(ids, ['in-use']);
  });

  it('после лимита за час новые регистрации отклоняются', async () => {
    for (let i = 0; i < REGISTRATIONS_PER_HOUR; i++) await addClient(`spam-${i}`, 60_000);
    await assert.rejects(() => guardClientRegistration(db, now), /Слишком много регистраций/);
    assert.equal(await total(), REGISTRATIONS_PER_HOUR + 1);
  });

  it('через час лимит снова свободен', async () => {
    await guardClientRegistration(db, now + 2 * HOUR);
  });
});
