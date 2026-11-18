// Интеграционные тесты: настоящий HTTP-слой и MCP поверх временной SQLite-базы с миграциями.
// Локальный режим (без входа) — как у `npm run dev`; облачный вход проверяется на проде.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'bus-test-'));
process.env.DB_PATH = join(dir, 'test.sqlite');
for (const k of Object.keys(process.env))
  if (k === 'VERCEL' || k.startsWith('GITHUB_CLIENT') || k.endsWith('TURSO_DATABASE_URL')) delete process.env[k];

const { createClient } = await import('@libsql/client');
const { drizzle } = await import('drizzle-orm/libsql/node');
const { connection, dbConfig } = await import('./db/index.ts');
const { migrateAll } = await import('./migrate.ts');
const { createService } = await import('./service/index.ts');
const { createApp } = await import('./http.ts');

type App = ReturnType<typeof createApp>;
let app: App;
let client: ReturnType<typeof createClient>;

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const post = async (path: string, body: unknown) => {
  const res = await app.request(path, json(body));
  return { status: res.status, body: await res.json() };
};
const get = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await migrateAll();
  client = createClient({ url: connection().url });
  app = createApp({ service: createService(drizzle({ client, ...dbConfig })), auth: null });
});

after(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('HTTP API', () => {
  let anya = '';

  it('локальная установка открыта без входа', async () => {
    const r = await get('/api/setup');
    assert.equal(r.status, 200);
    assert.equal(r.body.auth, false);
    assert.equal((await get('/api/me')).body.isAdmin, true);
  });

  it('участники: логин GitHub нормализуется и не повторяется', async () => {
    const r = await post('/api/members', { name: 'Аня', githubLogin: 'Anya-Test' });
    assert.equal(r.status, 200);
    anya = r.body.id;
    const members = (await get('/api/members')).body;
    assert.equal(members[0].githubLogin, 'anya-test');
    const dup = await post('/api/members', { name: 'Другая Аня', githubLogin: 'ANYA-TEST' });
    assert.equal(dup.status, 409);
    const bad = await post('/api/members', { name: 'Кто-то', githubLogin: 'not a login' });
    assert.equal(bad.status, 400);
  });

  it('поездки: пробег по одометру, разрыв и итоги года', async () => {
    assert.equal((await post('/api/trips', { date: '2026-11-09', memberId: null, odoStart: 1000, odoEnd: 1042 })).status, 200);
    const trip = await post('/api/trips', {
      date: '2026-11-14',
      endDate: '2026-11-15',
      memberId: anya,
      odoStart: 1100,
      odoEnd: 1368,
      note: 'Варшава → Казимеж-Дольны',
    });
    assert.equal(trip.status, 200);
    const j = (await get('/api/journal?year=2026')).body;
    assert.equal(j.summary.totalKm, 310);
    assert.equal(j.summary.sharedKm, 42);
    assert.deepEqual(j.summary.members, [{ memberId: anya, km: 268, days: 2, trips: 1 }]);
    assert.deepEqual(j.lastOdometer, { km: 1368, date: '2026-11-15' });
    assert.equal(j.issues.length, 1);
    assert.equal(j.issues[0].km, 58);
  });

  it('поездки: понятные ошибки валидации', async () => {
    const back = await post('/api/trips', { date: '2026-11-16', memberId: null, odoStart: 1400, odoEnd: 1300 });
    assert.equal(back.status, 400);
    assert.match(back.body.error, /после должен быть больше/);
    const noKm = await post('/api/trips', { date: '2026-11-16', memberId: null });
    assert.equal(noKm.status, 400);
    const badDate = await post('/api/trips', { date: '2026-02-30', memberId: null, km: 10 });
    assert.equal(badDate.status, 400);
  });

  it('участника с поездками нельзя удалить — только отключить', async () => {
    assert.equal((await post('/api/members/delete', { id: anya })).status, 409);
    assert.equal((await post('/api/members/update', { id: anya, active: false })).status, 200);
    const onInactive = await post('/api/trips', { date: '2026-11-20', memberId: anya, km: 5 });
    assert.equal(onInactive.status, 400);
  });
});

describe('защита', () => {
  it('меняющий запрос не-JSON (форма с чужого сайта) отклоняется', async () => {
    const res = await app.request('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ date: '2026-11-22', memberId: null, km: 1 }),
    });
    assert.equal(res.status, 415);
  });

  it('продакшен отвечает только на своём домене', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.BETTER_AUTH_URL = 'https://bus.example';
    try {
      const prod = createApp({ service: createService(drizzle({ client, ...dbConfig })), auth: null });
      const old = await prod.request('https://bus-abc123.vercel.app/api/setup', { headers: { host: 'bus-abc123.vercel.app' } });
      assert.equal(old.status, 308);
      assert.equal(old.headers.get('location'), 'https://bus.example/api/setup');
      const write = await prod.request('https://bus-abc123.vercel.app/api/trips', {
        ...json({}),
        headers: { host: 'bus-abc123.vercel.app', 'Content-Type': 'application/json' },
      });
      assert.equal(write.status, 421);
      const ok = await prod.request('https://bus.example/api/setup', { headers: { host: 'bus.example' } });
      assert.equal(ok.status, 200);
    } finally {
      delete process.env.VERCEL_ENV;
      delete process.env.BETTER_AUTH_URL;
    }
  });
});

describe('MCP', () => {
  const mcp = (id: number, method: string, params: unknown = {}) =>
    app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
  const data = async (res: Response) => {
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line ? line.slice(5) : text);
  };

  it('отдаёт инструменты журнала', async () => {
    const init = await data(
      await mcp(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }),
    );
    assert.equal(init.result.serverInfo.name, 'bus');
    const tools = (await data(await mcp(2, 'tools/list'))).result.tools.map((t: { name: string }) => t.name);
    for (const name of ['get_journal', 'list_members', 'add_trip', 'update_trip', 'delete_trip']) assert.ok(tools.includes(name), name);
  });

  it('записывает поездку и сообщает об ошибке человеческим текстом', async () => {
    const ok = await data(await mcp(3, 'tools/call', { name: 'add_trip', arguments: { date: '2026-11-21', member_id: null, km: 15 } }));
    assert.ok(!ok.result.isError);
    const bad = await data(
      await mcp(4, 'tools/call', {
        name: 'add_trip',
        arguments: { date: '2026-11-21', member_id: null, odometer_start: 10, odometer_end: 5 },
      }),
    );
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /после должен быть больше/);
  });
});
