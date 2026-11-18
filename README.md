# Бус

Общий бортжурнал буса, которым вместе владеют друзья: кто, когда и сколько проехал, личный и общий
пробег, личные дни пользования за год. Записывать можно с телефона прямо у буса — или разговором
через Claude / ChatGPT.

**Прод:** https://bus.akapps.click · вход через GitHub, только для участников.

- **Бортжурнал.** Поездка личная (на участника) или общая (по делам буса). Пробег — по одометру
  «до/после» или километрами. «Одометр до» подставляется из последней записи, пробег считается
  вживую, а **разрывы одометра** (км, которые никто не записал) видны всем прямо в ленте.
- **Итоги года.** Личные км и дни по каждому участнику: день считается один раз, многодневная
  поездка — каждым днём.
- **Участники.** Админы добавляют совладельцев, выдают вход по GitHub-логину и назначают других
  админов. Участник без GitHub тоже учитывается — за него записывают другие.
- **Ассистент (MCP) — главная фишка.** Каждый участник подключает своего Claude или ChatGPT по адресу
  `https://bus.akapps.click/mcp` (вход через GitHub) и ведёт журнал словами: «запиши поездку, одометр
  181 232 → 181 500, Казимеж». Инструкция — в приложении, раздел «Ассистент».

Прототип с калькулятором взносов: https://bus-cost-calculator.mishka3097.chatgpt.site/ — деньги
(заправки, обслуживание, взносы) добавим позже.

## Стек

Как у [MoreBlood/cash-flow](https://github.com/MoreBlood/cash-flow), без банков:

| Часть | Что |
|---|---|
| Сервер | TypeScript, [Hono](https://hono.dev) (`src/`), Node запускает `.ts` напрямую, без сборки |
| База | SQLite локально / [Turso](https://turso.tech) в облаке, [Drizzle ORM](https://orm.drizzle.team), миграции `drizzle-kit` |
| Вход и OAuth для MCP | [Better Auth](https://better-auth.com): GitHub + плагин `mcp` (OAuth 2.1, DCR/CIMD, PKCE) |
| MCP | `@modelcontextprotocol/server` (Streamable HTTP) |
| Фронт | React 19 + Vite + Radix Themes + Biome, слои FSD (`web/src`) |
| Хостинг | Vercel: продакшен собирается из `main` |

## Разработка

Нужен Node 22.18+.

```bash
npm install && npm install --prefix web
npm run demo    # вымышленные участники и поездки в локальной базе data/bus.sqlite
npm run dev     # API на :5055 + Vite на http://localhost:5173
```

Локально вход выключен (сервер слушает только 127.0.0.1) и у вас права админа. Чистая база —
`rm -rf data/`.

Перед PR: `npm run check` — типы сервера и фронта, тесты, линтер. То же самое гоняет CI.

### Где что

```
src/
  http.ts            маршруты API, вход, MCP
  mcp.ts             инструменты для ассистентов
  auth-options.ts    вход через GitHub, кого пускать
  service/           логика: участники, поездки, расчёты журнала (journal.ts + тесты)
  db/schema.ts       таблицы; auth-schema.ts — таблицы Better Auth (генерируются)
drizzle/             миграции
web/src/
  app/               оболочка, тема, навигация, стили (app.css)
  pages/             журнал, поездка, участники, ассистент, вход
  widgets/ features/ shared/
```

### Изменить схему базы

1. Правите `src/db/schema.ts`.
2. `npm run db:generate` — появится миграция в `drizzle/`, коммитьте её вместе с кодом.
3. На проде миграции применяются при сборке из `main` (`npm run build` → `src/migrate.ts`).

### Дизайн

Интерфейс сделан скиллом [impeccable](https://github.com/pbakaus/impeccable): мир «жёлтых указателей»
— жёлтое только на полосе с одометром, главном действии и активной навигации, знаки белым по
чёрному квадрату, прямые углы. Решения — в `PRODUCT.md`, `DESIGN.md` и
`.impeccable/surfaces/web-src.md`; новые экраны собирайте из того же словаря (`SignButton`,
`Pictogram`, строки ленты).

## Как присылать изменения

Ветка или форк → PR в `main` → зелёный CI («Готово к мержу») и одобрение → squash-мерж → Vercel сам
выкатит `main`. Прямые пуши в `main` закрыты. Подробно — в [CONTRIBUTING.md](CONTRIBUTING.md).

Каждый PR получает **живое превью** на Vercel: отдельная превью-база с демо-данными, вход выключен —
боевые данные и секреты превью недоступны.

Версии — SemVer и теги `vX.Y.Z`: release-please собирает [CHANGELOG.md](CHANGELOG.md) из заголовков PR
(`feat: …`, `fix: …`) и держит релизный PR; его мерж выпускает версию.

## Деплой (для админа)

Проект Vercel привязан к этому репозиторию, продакшен-ветка — `main`. Переменные окружения
(Production):

| Переменная | Значение |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | ставит интеграция Turso |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth App на GitHub, callback `https://bus.akapps.click/api/auth/callback/github` |
| `ADMIN_GITHUB_USERS` | главные админы (логины GitHub), через запятую; при первом входе привязываются к id аккаунта — после переименования на GitHub обновите и здесь |
| `BETTER_AUTH_URL` | `https://bus.akapps.click` |
| `BETTER_AUTH_SECRET` | случайная строка (`openssl rand -hex 32`) |

Поменяли переменные — Deployments → ⋯ → Redeploy.

## Лицензия

MIT
