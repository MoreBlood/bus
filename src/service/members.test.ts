// Доступ: участник привязан к неизменяемому id аккаунта GitHub, а не к логину, который можно занять.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'bus-access-'));
process.env.DB_PATH = join(dir, 'access.sqlite');
process.env.ADMIN_GITHUB_USERS = 'Boss';
for (const k of Object.keys(process.env)) if (k.endsWith('TURSO_DATABASE_URL')) delete process.env[k];

const { createClient } = await import('@libsql/client');
const { drizzle } = await import('drizzle-orm/libsql/node');
const { account, user } = await import('../db/auth-schema.ts');
const { connection, dbConfig } = await import('../db/index.ts');
const { members } = await import('../db/schema.ts');
const { migrateAll } = await import('../migrate.ts');
const { admitGithubUser, createMember, resolveViewer, updateMember, LOCAL_VIEWER } = await import('./members.ts');

let client: ReturnType<typeof createClient>;
let db: ReturnType<typeof drizzle<typeof dbConfig.schema>>;

/** Пользователь Better Auth с привязанным аккаунтом GitHub — как после входа. */
async function githubUser(id: string, login: string, githubId: string) {
  const now = new Date();
  await db.insert(user).values({ id, name: login, email: `${id}@example.com`, updatedAt: now });
  await db.insert(account).values({ id: `acc-${id}`, accountId: githubId, providerId: 'github', userId: id, updatedAt: now });
}

before(async () => {
  await migrateAll();
  client = createClient({ url: connection().url });
  db = drizzle({ client, ...dbConfig });
  await db.insert(members).values({ id: 'anya', name: 'Аня', githubLogin: 'anya' });
});

after(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('вход через GitHub', () => {
  it('первый вход привязывает id аккаунта к участнику', async () => {
    assert.equal(await admitGithubUser(db, 'Anya', '111'), true);
    const m = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.id, 'anya') });
    assert.equal(m?.githubId, '111');
  });

  it('занявший освободившийся логин чужой аккаунт не входит', async () => {
    assert.equal(await admitGithubUser(db, 'anya', '666'), false);
  });

  it('смена логина на GitHub не теряет участника', async () => {
    assert.equal(await admitGithubUser(db, 'anya-new', '111'), true);
    const m = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.id, 'anya') });
    assert.equal(m?.githubLogin, 'anya-new');
  });

  it('участник без логина не входит; логин добавили позже — входит и привязывается', async () => {
    const { id } = await createMember(db, LOCAL_VIEWER, { name: 'Костя' });
    const m0 = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.id, id) });
    assert.equal(m0?.githubLogin, null);
    assert.equal(await admitGithubUser(db, 'kostya', '777'), false);
    await updateMember(db, LOCAL_VIEWER, { id, githubLogin: 'Kostya' });
    assert.equal(await admitGithubUser(db, 'kostya', '777'), true);
    const m = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.id, id) });
    assert.equal(m?.githubId, '777');
  });

  it('посторонний не входит', async () => {
    assert.equal(await admitGithubUser(db, 'stranger', '333'), false);
  });

  it('главный админ заводится при первом входе, его логин не угнать', async () => {
    assert.equal(await admitGithubUser(db, 'boss', '444'), true);
    const boss = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.githubLogin, 'boss') });
    assert.equal(boss?.isAdmin, true);
    assert.equal(boss?.githubId, '444');
    assert.equal(await admitGithubUser(db, 'Boss', '555'), false);
  });
});

describe('сессия', () => {
  it('права определяются по id аккаунта GitHub', async () => {
    await githubUser('u-anya', 'anya-new', '111');
    const v = await resolveViewer(db, 'u-anya');
    assert.equal(v?.memberId, 'anya');
    assert.equal(v?.isAdmin, false);
  });

  it('пользователь с тем же логином, но другим аккаунтом — без доступа', async () => {
    await githubUser('u-fake', 'anya-new', '999');
    assert.equal(await resolveViewer(db, 'u-fake'), null);
  });

  it('выбывший участник теряет доступ сразу, без перевхода', async () => {
    await db.update(members).set({ active: false }).where((await import('drizzle-orm')).eq(members.id, 'anya'));
    assert.equal(await resolveViewer(db, 'u-anya'), null);
  });

  it('админ меняет логин участника — привязка к аккаунту сбрасывается', async () => {
    await updateMember(db, LOCAL_VIEWER, { id: 'anya', githubLogin: 'anya-2', active: true });
    const m = await db.query.members.findFirst({ where: (t, { eq }) => eq(t.id, 'anya') });
    assert.equal(m?.githubId, null);
  });
});
