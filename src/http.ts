// HTTP: API приложения, вход и OAuth для MCP (облако), MCP. Общий для локального сервера и Vercel.
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { requireMcpAuth } from '@better-auth/mcp';
import { type Context, Hono, type Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type Auth, authConfigured, authRequired, baseURL, demoMode, mcpResource } from './auth.ts';
import { createMcp } from './mcp.ts';
import { AppError } from './service/errors.ts';
import type { Service, Viewer } from './service/index.ts';
import { LOCAL_VIEWER } from './service/members.ts';
import { VERSION } from './version.ts';

export type Env = { Variables: { viewer: Viewer } };

export function createApp({ service, auth }: { service: Service; auth: Auth | null }) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof AppError) return c.json({ error: err.message }, err.status);
    console.error(err);
    // в облаке внутренности (SQL, имена таблиц) наружу не отдаём — подробности в логах Vercel
    if (process.env.VERCEL) return c.json({ error: 'Ошибка сервера. Попробуйте ещё раз.' }, 500);
    // локально у ошибок драйвера (DrizzleQueryError) суть — в cause
    const cause = (err as { cause?: { message?: string; code?: string } }).cause;
    const message = cause?.message ? `${cause.code ? `${cause.code}: ` : ''}${cause.message}` : String(err.message || err);
    return c.json({ error: message }, 500);
  });

  // Продакшен отвечает только на своём домене: старые адреса деплоев *.vercel.app открыты, и через них
  // можно было бы ходить в боевой API в обход домена (и старого кода).
  const canonical = process.env.VERCEL_ENV === 'production' && process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : null;
  if (canonical)
    app.use('*', async (c, next) => {
      const host = (c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '').split(',')[0].trim();
      if (host === canonical.host) return next();
      const url = new URL(c.req.url);
      url.searchParams.delete('path'); // служебный параметр rewrite Vercel (/api/:path* → /api?path=…)
      if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.redirect(`${canonical.origin}${url.pathname}${url.search}`, 308);
      return c.json({ error: `Используйте ${canonical.origin}` }, 421);
    });

  // --- вход (Better Auth) и OAuth-метаданные для MCP-коннекторов ------------------
  if (auth) {
    const asMetadata = oauthProviderAuthServerMetadata(auth);
    const oidcMetadata = oauthProviderOpenIdConfigMetadata(auth);
    // регистрация OAuth-клиентов — с общим лимитом и чисткой брошенных (см. service/oauth-clients.ts)
    app.post('/api/auth/oauth2/register', async (c) => {
      await service.guardClientRegistration();
      return auth.handler(c.req.raw);
    });
    app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
    for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/*'])
      app.get(p, (c) => asMetadata(c.req.raw));
    for (const p of ['/.well-known/openid-configuration', '/.well-known/openid-configuration/*'])
      app.get(p, (c) => oidcMetadata(c.req.raw));
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/*'])
      app.get(p, (c) => auth.handler(c.req.raw));
  }

  /** Облако: участник, вошедший через GitHub. Локально (127.0.0.1) — без входа, с правами админа. */
  const viewerOf = async (c: Context<Env>): Promise<Viewer | null> => {
    if (!authRequired()) return LOCAL_VIEWER;
    if (!auth || !authConfigured())
      throw new HTTPException(503, { message: 'Вход не настроен: нужны GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ADMIN_GITHUB_USERS' });
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    return s ? service.resolveViewer(s.user.id) : null;
  };
  const guard = async (c: Context<Env>, next: Next) => {
    const v = await viewerOf(c);
    if (!v) throw new HTTPException(401, { message: 'unauthorized' });
    c.set('viewer', v);
    await next();
  };

  // --- MCP: в облаке — OAuth-токен Better Auth, локально — без входа ----------------
  const mcpProtected = auth
    ? requireMcpAuth(
        auth,
        async (req, claims) => {
          const viewer = claims.sub ? await service.resolveViewer(claims.sub) : null;
          if (!viewer) return Response.json({ error: 'Нет доступа: вы не участник буса' }, { status: 403 });
          return createMcp(service, viewer).fetch(req);
        },
        { resource: mcpResource() },
      )
    : null;
  app.all('/mcp', (c) => {
    if (mcpProtected) return mcpProtected(c.req.raw);
    if (authRequired()) throw new HTTPException(503, { message: 'Вход не настроен' });
    return createMcp(service, LOCAL_VIEWER).fetch(c.req.raw);
  });

  // состояние установки — открыто без входа (секретов нет): по нему фронт показывает мастер настройки
  app.get('/api/setup', async (c) => {
    const v = authRequired() && auth && authConfigured() ? await viewerOf(c).catch(() => null) : null;
    return c.json({
      auth: authRequired(),
      authConfigured: !authRequired() || authConfigured(),
      login: v?.login ?? null,
      baseUrl: baseURL(),
      mcpUrl: mcpResource(),
      githubCallbackUrl: `${baseURL()}/api/auth/callback/github`,
      demo: demoMode(),
      version: VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      pr: process.env.VERCEL_GIT_PULL_REQUEST_ID || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    });
  });

  // --- API приложения ------------------------------------------------------------
  const api = new Hono<Env>();
  // CSRF: меняющие запросы — только JSON (форма с чужого сайта так не умеет без CORS) и только со своего сайта
  api.use(async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json'))
        throw new HTTPException(415, { message: 'Нужен Content-Type: application/json' });
      const origin = c.req.header('origin');
      if (origin && authRequired() && origin !== new URL(baseURL()).origin) throw new HTTPException(403, { message: 'Чужой сайт' });
    }
    await next();
  });
  api.use(guard);

  // biome-ignore lint/suspicious/noExplicitAny: тело проверяет сервис
  const body = async (c: Context): Promise<any> => {
    try {
      return await c.req.json();
    } catch {
      throw new HTTPException(400, { message: 'invalid JSON' });
    }
  };

  api.get('/me', (c) => c.json(c.get('viewer')));
  api.get('/assistant', async (c) =>
    c.json({
      mcpUrl: mcpResource(),
      local: !authRequired() && !demoMode(),
      demo: demoMode(),
      connections: await service.assistantConnections(c.get('viewer')),
    }),
  );

  api.get('/members', async (c) => c.json(await service.members()));
  api.post('/members', async (c) => c.json(await service.createMember(c.get('viewer'), await body(c))));
  api.post('/members/update', async (c) => c.json(await service.updateMember(c.get('viewer'), await body(c))));
  api.post('/members/delete', async (c) => c.json(await service.deleteMember(c.get('viewer'), (await body(c)).id)));

  api.get('/journal', async (c) => c.json(await service.journal(c.req.query('year') || undefined)));
  api.get('/trips/:id', async (c) => c.json(await service.trip(c.req.param('id'))));
  api.post('/trips', async (c) => c.json(await service.createTrip(c.get('viewer'), await body(c))));
  api.post('/trips/update', async (c) => c.json(await service.updateTrip(c.get('viewer'), await body(c))));
  api.post('/trips/delete', async (c) => c.json(await service.deleteTrip(c.get('viewer'), (await body(c)).id)));

  api.get('/export', async (c) => {
    c.header('Content-Disposition', `attachment; filename="bus-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(await service.exportData());
  });

  app.route('/api', api);
  return app;
}
