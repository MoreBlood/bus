// Приложение для Vercel (функция api/index.ts): база — Turso, вход — GitHub, статика — public/ через CDN.
// Миграции выполняются при сборке продакшена (npm run build → src/migrate.ts).
import { drizzle } from 'drizzle-orm/libsql/web';
import type { Hono } from 'hono';
import { authConfigured, createReadyAuth } from './auth.ts';
import { connection, dbConfig } from './db/index.ts';
import { createApp, type Env } from './http.ts';
import { createService } from './service/index.ts';

const { url, authToken } = connection();
const db = drizzle({ connection: { url, authToken }, ...dbConfig });
const service = createService(db);
const auth = authConfigured() ? await createReadyAuth(db, service.canSignIn) : null;
const app: Hono<Env> = createApp({ service, auth });

export default app;
