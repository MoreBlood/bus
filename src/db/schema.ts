// Схема данных (Drizzle). Даты — 'YYYY-MM-DD', пробег и одометр — целые километры.
// Имена колонок — snake_case (casing в drizzle.config.ts и при создании клиента).
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Совладельцы буса. GitHub-логин нужен только для входа: записывать можно и за участника без GitHub. */
export const members = sqliteTable(
  'members',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    /** логин GitHub в нижнем регистре; null — участник не входит в приложение */
    githubLogin: text(),
    isAdmin: integer({ mode: 'boolean' }).notNull().default(false),
    /** выбывший участник: не входит и не предлагается в новых записях, история остаётся */
    active: integer({ mode: 'boolean' }).notNull().default(true),
    sort: integer().notNull().default(0),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [uniqueIndex('members_github_login').on(t.githubLogin).where(sql`${t.githubLogin} IS NOT NULL`)],
);

/**
 * Поездка в бортжурнале. memberId = null — общая поездка (по общим делам).
 * Пробег — либо по одометру (odoStart/odoEnd, km = разница), либо введён вручную (одометр пустой).
 */
export const trips = sqliteTable(
  'trips',
  {
    id: text().primaryKey(),
    /** день выезда */
    date: text().notNull(),
    /** день возвращения, если поездка на несколько дней; null — в тот же день */
    endDate: text(),
    memberId: text().references(() => members.id),
    km: integer().notNull(),
    odoStart: integer(),
    odoEnd: integer(),
    note: text().notNull().default(''),
    /** GitHub-логин автора записи (null — локальная установка без входа, MCP без логина) */
    createdBy: text(),
    updatedBy: text(),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [
    index('trips_date').on(t.date),
    index('trips_member').on(t.memberId, t.date),
    check('trips_km_positive', sql`${t.km} > 0`),
  ],
);

export type Member = typeof members.$inferSelect;
export type Trip = typeof trips.$inferSelect;
