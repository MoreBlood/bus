// Самостоятельная регистрация OAuth-клиентов (DCR) открыта без входа — так подключаются claude.ai и ChatGPT.
// Чтобы её нельзя было использовать для засорения базы: общий лимит регистраций в час и чистка брошенных
// клиентов (без согласия и токенов) старше суток.
import { and, count, eq, gt, isNull, lt, notExists } from 'drizzle-orm';
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '../db/auth-schema.ts';
import type { Db } from '../db/index.ts';
import { tooMany } from './errors.ts';

export const REGISTRATIONS_PER_HOUR = 30;
const HOUR = 3_600_000;

export async function guardClientRegistration(db: Db, now = Date.now()) {
  const used = (table: typeof oauthConsent | typeof oauthAccessToken | typeof oauthRefreshToken) =>
    notExists(db.select({ x: table.id }).from(table).where(eq(table.clientId, oauthClient.clientId)));
  await db
    .delete(oauthClient)
    .where(
      and(
        isNull(oauthClient.userId),
        lt(oauthClient.createdAt, new Date(now - 24 * HOUR)),
        used(oauthConsent),
        used(oauthAccessToken),
        used(oauthRefreshToken),
      ),
    );
  const recent = await db
    .select({ n: count() })
    .from(oauthClient)
    .where(and(isNull(oauthClient.userId), gt(oauthClient.createdAt, new Date(now - HOUR))))
    .get();
  if ((recent?.n ?? 0) >= REGISTRATIONS_PER_HOUR)
    throw tooMany('Слишком много регистраций приложений за час. Попробуйте позже.');
}
