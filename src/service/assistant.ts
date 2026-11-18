// Подключённые ассистенты (MCP-коннекторы) участника: согласия OAuth, которые он выдал.
import { and, desc, eq } from 'drizzle-orm';
import { oauthClient, oauthConsent, user } from '../db/auth-schema.ts';
import type { Db } from '../db/index.ts';
import type { Viewer } from './members.ts';

export interface AssistantConnection {
  clientId: string;
  name: string;
  since: string | null;
}

export async function connections(db: Db, v: Viewer): Promise<AssistantConnection[]> {
  if (!v.login) return [];
  const u = await db.select({ id: user.id }).from(user).where(eq(user.name, v.login)).get();
  if (!u) return [];
  const rows = await db
    .select({ clientId: oauthConsent.clientId, name: oauthClient.name, createdAt: oauthConsent.createdAt })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(and(eq(oauthConsent.userId, u.id)))
    .orderBy(desc(oauthConsent.createdAt));
  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name || 'Ассистент',
    since: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}
