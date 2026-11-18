// Локальный сервер для разработки: http://127.0.0.1:5055, база — файл data/bus.sqlite, вход выключен
// (слушаем только 127.0.0.1). Собранный фронт отдаётся из public/; при `npm run dev` фронт — Vite на :5173.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import { authConfigured, createReadyAuth } from './auth.ts';
import { connection, dbConfig } from './db/index.ts';
import { createApp } from './http.ts';
import { migrateAll } from './migrate.ts';
import { createService } from './service/index.ts';

const ROOT = new URL('../', import.meta.url).pathname;
try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {}

const PORT = Number(process.env.PORT || 5055);

await migrateAll();
const { url, authToken } = connection();
const client = createClient({ url, authToken });
await client.execute('PRAGMA busy_timeout = 5000');
const db = drizzle({ client, ...dbConfig });
console.log('db:', url);

const service = createService(db);
const app = createApp({ service, auth: authConfigured() ? await createReadyAuth(db, service.canSignIn) : null });

// фронтенд (собранный Vite) + SPA-fallback
app.use('/*', serveStatic({ root: join(ROOT, 'public') }));
app.get('*', serveStatic({ path: join(ROOT, 'public/index.html') }));

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => console.log(`api on http://localhost:${PORT}`));
