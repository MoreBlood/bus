// Схема данных (Drizzle). Даты — 'YYYY-MM-DD', пробег и одометр — целые километры.
// Имена колонок — snake_case (casing в drizzle.config.ts и при создании клиента).
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Совладельцы буса. GitHub-логин нужен только для входа: записывать можно и за участника без GitHub. */
export const members = sqliteTable(
  'members',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    /** логин GitHub в нижнем регистре; null — участник не входит в приложение */
    githubLogin: text(),
    /**
     * Числовой id аккаунта GitHub — привязывается при первом входе. Логин можно сменить, и его займёт
     * кто-то другой; id не меняется, поэтому доступ проверяется по нему.
     */
    githubId: text(),
    isAdmin: integer({ mode: 'boolean' }).notNull().default(false),
    /** выбывший участник: не входит и не предлагается в новых записях, история остаётся */
    active: integer({ mode: 'boolean' }).notNull().default(true),
    /** совладелец с даты (YYYY-MM-DD); null — с самого начала. Для истории: раньше в поездки не записывается */
    joinedOn: text(),
    /** с какой даты не совладелец (YYYY-MM-DD): до неё его можно записывать в поездки — для истории */
    leftOn: text(),
    sort: integer().notNull().default(0),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [
    uniqueIndex('members_github_login').on(t.githubLogin).where(sql`${t.githubLogin} IS NOT NULL`),
    uniqueIndex('members_github_id').on(t.githubId).where(sql`${t.githubId} IS NOT NULL`),
  ],
);

/**
 * Поездка в бортжурнале. Кто ехал — в trip_riders (владельцы и их гости); shared — по делам буса
 * (ТО, мойка, перегон): её стоимость не попадает в личные счета, её несёт общая касса.
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
    shared: integer({ mode: 'boolean' }).notNull().default(false),
    /**
     * Устарело: до участников в trip_riders тут был единственный ездивший. Данные перенесены миграцией 0002;
     * колонку не удаляем — пересоздание таблицы в SQLite рискует каскадом стереть trip_riders.
     */
    memberId: text().references(() => members.id),
    km: integer().notNull(),
    /** расходы поездки сверх километров (платные дороги, парковки, паром), гроши; делятся как поездка */
    extrasAmount: integer().notNull().default(0),
    /** кто заплатил расходы; null — платили вскладчину на месте */
    extrasPaidBy: text().references(() => members.id),
    extrasNote: text().notNull().default(''),
    odoStart: integer(),
    odoEnd: integer(),
    note: text().notNull().default(''),
    /** GitHub-логин автора записи (null — локальная установка без входа, MCP без логина) */
    createdBy: text(),
    updatedBy: text(),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [index('trips_date').on(t.date), check('trips_km_positive', sql`${t.km} > 0`)],
);

/** Владельцы в поездке. guests — гости, которых он позвал: их доля записывается на него. */
export const tripRiders = sqliteTable(
  'trip_riders',
  {
    tripId: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    memberId: text()
      .notNull()
      .references(() => members.id),
    guests: integer().notNull().default(0),
    /** сам не ехал — бус отдан его гостям: его доля не считается, а доли гостей — на нём */
    absent: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.memberId] }),
    index('trip_riders_member').on(t.memberId),
    check('trip_riders_guests', sql`${t.guests} >= 0`),
  ],
);

/** Заправка. Сумма — в грошах. paidBy = null — заплачено из общей кассы. */
export const refuels = sqliteTable(
  'refuels',
  {
    id: text().primaryKey(),
    date: text().notNull(),
    odometer: integer(),
    liters: real().notNull(),
    amount: integer().notNull(),
    paidBy: text().references(() => members.id),
    /** до полного бака — по таким заправкам считается фактический расход */
    full: integer({ mode: 'boolean' }).notNull().default(true),
    note: text().notNull().default(''),
    createdBy: text(),
    updatedBy: text(),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [index('refuels_date').on(t.date), check('refuels_positive', sql`${t.liters} > 0 AND ${t.amount} > 0`)],
);

/**
 * Ремонт и ТО. Обычно платит касса: ремонт гасится из резерва — амортизации, которую каждый начислил своими км.
 * kind: service — плановое ТО, repair — ремонт, tires — шины, other — прочее, upgrade — улучшение (поровну на
 * владельцев, не из резерва). chargedTo — поломка по вине участника: вся сумма на нём. Сумма — в грошах.
 */
export const repairs = sqliteTable(
  'repairs',
  {
    id: text().primaryKey(),
    date: text().notNull(),
    odometer: integer(),
    kind: text().notNull().default('repair'),
    title: text().notNull(),
    amount: integer().notNull(),
    /** кто заплатил в сервисе; null — из общей кассы */
    paidBy: text().references(() => members.id),
    /** за чей счёт, если по вине участника; null — из резерва (или поровну для улучшений) */
    chargedTo: text().references(() => members.id),
    note: text().notNull().default(''),
    createdBy: text(),
    updatedBy: text(),
    createdAt: text().notNull().default(now),
    updatedAt: text(),
  },
  (t) => [index('repairs_date').on(t.date), check('repairs_positive', sql`${t.amount} > 0`)],
);

/** Перевод между участниками (или с общей кассой, null) — закрывает долги за бензин. Сумма — в грошах. */
export const transfers = sqliteTable(
  'transfers',
  {
    id: text().primaryKey(),
    date: text().notNull(),
    fromId: text().references(() => members.id),
    toId: text().references(() => members.id),
    amount: integer().notNull(),
    note: text().notNull().default(''),
    createdBy: text(),
    createdAt: text().notNull().default(now),
  },
  (t) => [index('transfers_date').on(t.date), check('transfers_positive', sql`${t.amount} > 0`)],
);

/**
 * Ставки, действующие с даты: поездка считается по периоду, в который она попала, — новая цена топлива
 * не переписывает прошлые поездки. basis — из чего сложена амортизация (помощник), для объяснения.
 */
export const ratePeriods = sqliteTable(
  'rate_periods',
  {
    id: text().primaryKey(),
    validFrom: text().notNull(),
    amortPerKm: real().notNull(),
    fuelPer100: real().notNull(),
    fuelPrice: real().notNull(),
    basis: text({ mode: 'json' }),
    createdBy: text(),
    createdAt: text().notNull().default(now),
  },
  (t) => [uniqueIndex('rate_periods_from').on(t.validFrom)],
);

/** Настройки расчёта (режим и тип топлива) — JSON по ключу. */
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).notNull(),
});

export type Member = typeof members.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type TripRider = typeof tripRiders.$inferSelect;
export type Refuel = typeof refuels.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type Repair = typeof repairs.$inferSelect;
export type RatePeriodRow = typeof ratePeriods.$inferSelect;
