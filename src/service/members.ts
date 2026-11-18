// Участники (совладельцы) и доступ: кто входит, кто админ.
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isEnvAdmin } from '../auth-options.ts';
import { user } from '../db/auth-schema.ts';
import type { Db } from '../db/index.ts';
import { type Member, members, trips } from '../db/schema.ts';
import { badRequest, conflict, forbidden, notFound } from './errors.ts';

/** Кто делает запрос. Локальная установка без входа — полный доступ (сервер слушает только 127.0.0.1). */
export interface Viewer {
  login: string | null;
  memberId: string | null;
  isAdmin: boolean;
  /** админ из ADMIN_GITHUB_USERS: админство в приложении у него не снять */
  envAdmin: boolean;
}

export const LOCAL_VIEWER: Viewer = { login: null, memberId: null, isAdmin: true, envAdmin: false };

const norm = (login: string) => login.trim().toLowerCase();

// правила логинов GitHub: латиница, цифры и одиночные дефисы, до 39 символов
const githubLogin = z
  .string()
  .trim()
  .regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i, 'Такого логина GitHub не бывает')
  .transform(norm);

const memberInput = z.object({
  name: z.string().trim().min(1, 'Нужно имя').max(60, 'Имя длиннее 60 символов'),
  githubLogin: githubLogin.nullish().or(z.literal('').transform(() => null)),
  isAdmin: z.boolean().optional(),
});

const memberPatch = memberInput.partial().extend({ id: z.string().min(1), active: z.boolean().optional() });

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.output<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
};

const byLogin = (db: Db, login: string) => db.select().from(members).where(eq(members.githubLogin, norm(login))).get();

/** Пустить ли через GitHub: активный участник с этим логином (главных админов пускает auth-options). */
export async function canSignIn(db: Db, login: string) {
  const m = await byLogin(db, login);
  return !!m?.active;
}

/**
 * Права по логину из сессии. Главный админ без карточки участника получает её при первом входе,
 * чтобы его поездки было на кого записывать. null — доступа нет (логин убрали или участник выбыл).
 */
export async function resolveViewer(db: Db, login: string): Promise<Viewer | null> {
  const envAdmin = isEnvAdmin(login);
  let m = await byLogin(db, login);
  if (!m && envAdmin) {
    const id = randomUUID();
    await db
      .insert(members)
      .values({ id, name: login, githubLogin: norm(login), isAdmin: true, sort: await nextSort(db) })
      .onConflictDoNothing();
    m = await byLogin(db, login);
  }
  if (envAdmin) return { login, memberId: m?.id ?? null, isAdmin: true, envAdmin: true };
  if (!m?.active) return null;
  return { login, memberId: m.id, isAdmin: m.isAdmin, envAdmin: false };
}

/** Логин GitHub по id пользователя Better Auth (из токена MCP). */
export async function loginByUserId(db: Db, userId: string) {
  return (await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get())?.name ?? null;
}

async function nextSort(db: Db) {
  const row = await db.select({ max: sql<number>`coalesce(max(${members.sort}), 0)` }).from(members).get();
  return (row?.max ?? 0) + 1;
}

export interface MemberView extends Member {
  /** админ из переменной окружения — снять в приложении нельзя */
  envAdmin: boolean;
  trips: number;
}

export async function listMembers(db: Db): Promise<MemberView[]> {
  const counts = await db.select({ memberId: trips.memberId, n: count() }).from(trips).groupBy(trips.memberId);
  const tripsOf = new Map(counts.map((c) => [c.memberId, c.n]));
  const rows = await db.select().from(members).orderBy(asc(members.sort), asc(members.name));
  return rows.map((m) => ({ ...m, envAdmin: isEnvAdmin(m.githubLogin), trips: tripsOf.get(m.id) ?? 0 }));
}

const requireAdmin = (v: Viewer) => {
  if (!v.isAdmin) throw forbidden('Участников меняют только админы');
};

async function assertLoginFree(db: Db, login: string | null | undefined, exceptId?: string) {
  if (!login) return;
  const other = await byLogin(db, login);
  if (other && other.id !== exceptId) throw conflict(`Логин ${login} уже у участника «${other.name}»`);
}

export async function createMember(db: Db, v: Viewer, input: unknown) {
  requireAdmin(v);
  const b = parse(memberInput, input);
  await assertLoginFree(db, b.githubLogin);
  const id = randomUUID();
  await db.insert(members).values({
    id,
    name: b.name,
    githubLogin: b.githubLogin ?? null,
    isAdmin: b.isAdmin ?? false,
    sort: await nextSort(db),
  });
  return { id };
}

export async function updateMember(db: Db, v: Viewer, input: unknown) {
  requireAdmin(v);
  const b = parse(memberPatch, input);
  const m = await db.select().from(members).where(eq(members.id, b.id)).get();
  if (!m) throw notFound('Участник не найден');
  const self = v.memberId === m.id;
  // себя не разжаловать и не отключить — иначе можно остаться без админки
  if (self && b.isAdmin === false && !v.envAdmin) throw badRequest('Снять админство с себя нельзя — попросите другого админа');
  if (self && b.active === false) throw badRequest('Отключить себя нельзя');
  if (self && b.githubLogin !== undefined && b.githubLogin !== m.githubLogin)
    throw badRequest('Свой логин GitHub меняет другой админ — иначе вы потеряете вход');
  if (b.githubLogin !== undefined) await assertLoginFree(db, b.githubLogin, m.id);
  const patch: Partial<Member> = { updatedAt: new Date().toISOString() };
  if (b.name !== undefined) patch.name = b.name;
  if (b.githubLogin !== undefined) patch.githubLogin = b.githubLogin ?? null;
  if (b.isAdmin !== undefined) patch.isAdmin = b.isAdmin;
  if (b.active !== undefined) patch.active = b.active;
  await db.update(members).set(patch).where(eq(members.id, m.id));
  return { ok: true };
}

export async function deleteMember(db: Db, v: Viewer, id: unknown) {
  requireAdmin(v);
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  if (v.memberId === id) throw badRequest('Удалить себя нельзя');
  const used = await db.select({ n: count() }).from(trips).where(eq(trips.memberId, id)).get();
  if (used?.n) throw conflict('У участника есть поездки — отключите его вместо удаления, история сохранится');
  const r = await db.delete(members).where(and(eq(members.id, id))).returning({ id: members.id });
  if (!r.length) throw notFound('Участник не найден');
  return { ok: true };
}
