// Конфиг входа (Better Auth): GitHub для браузера + OAuth 2.1-сервер для MCP-коннекторов
// (claude.ai, ChatGPT и др. подключаются вставкой https://…/mcp). Локально вход выключен:
// сервер слушает только 127.0.0.1.
import { createHash } from 'node:crypto';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import type { BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { demoMode } from './env.ts';

export { demoMode };

/** Облако (Vercel) или явно включённый вход. Без настроек в облаке сервис закрыт. Превью PR — демо без входа. */
export const authRequired = () => !demoMode() && !!(process.env.VERCEL || process.env.GITHUB_CLIENT_ID);
export const authConfigured = () =>
  !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.ADMIN_GITHUB_USERS);

const normLogin = (login: string) => login.trim().toLowerCase();

/** Главные админы из ADMIN_GITHUB_USERS: входят всегда, админство в приложении у них не снять. */
export const envAdmins = () =>
  (process.env.ADMIN_GITHUB_USERS || '')
    .split(',')
    .map(normLogin)
    .filter(Boolean);

export const isEnvAdmin = (login?: string | null) => !!login && envAdmins().includes(normLogin(login));

export const baseURL = () =>
  process.env.BETTER_AUTH_URL ||
  // превью PR живёт на своём адресе — MCP и ссылки должны вести туда же
  (demoMode() && process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : '') ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : `http://localhost:${process.env.PORT || 5055}`);

export const mcpResource = () => `${baseURL()}/mcp`;

/** Секрет установки: BETTER_AUTH_SECRET или производный от секрета OAuth-приложения GitHub. */
export const authSecret = () =>
  process.env.BETTER_AUTH_SECRET ||
  createHash('sha256').update(`bus-auth:${process.env.GITHUB_CLIENT_SECRET ?? 'local'}`).digest('hex');

/** Кого пускать: проверяет сервер (участник с этим логином или главный админ). */
export type CanSignIn = (login: string) => Promise<boolean>;

/** Конфиг Better Auth — общий для сервера и генератора схемы (scripts/gen-auth-schema.ts). */
export const authOptions = (database?: BetterAuthOptions['database'], canSignIn?: CanSignIn) =>
  ({
    baseURL: baseURL(),
    secret: authSecret(),
    database,
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        // пускаем только участников буса; логин GitHub храним как имя пользователя
        mapProfileToUser: async (profile) => {
          const ok = isEnvAdmin(profile.login) || (canSignIn ? await canSignIn(profile.login) : false);
          if (!ok)
            throw new APIError('FORBIDDEN', {
              message: `${profile.login} нет в списке участников. Попросите админа добавить ваш GitHub-логин.`,
            });
          return { name: profile.login };
        },
      },
    },
    plugins: [
      jwt(),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource: mcpResource(),
        // claude.ai и ChatGPT регистрируются сами (DCR); выдать токен всё равно можно только после входа и согласия
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  }) satisfies BetterAuthOptions;
