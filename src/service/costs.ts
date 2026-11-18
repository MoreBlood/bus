// Деньги поездок — чистые функции без базы (тесты в costs.test.ts).
//
// Стоимость поездки = км × (амортизация + бензин) за км. Делится поровну на всех в машине: владельцы и
// их гости; доля гостя записывается на владельца, который его позвал. Поездка «по делам буса» (shared)
// ни на кого не записывается — её несёт общая касса. Дни пользования (по ним потом делятся постоянные
// расходы) делятся между владельцами в поездке; гости дней не занимают.
import { tripDays } from './journal.ts';

export type FuelMode = 'rate' | 'refuels';

export interface CostSettings {
  /** амортизация, zł за км: износ, шины, масло, потеря стоимости */
  amortPerKm: number;
  /** расход, л/100 км — для бензина по ставке */
  fuelPer100: number;
  /** цена литра, zł — для бензина по ставке */
  fuelPrice: number;
  /** rate — бак на бак: бензин делят в поездке по ставке; refuels — учёт заправок и долгов */
  fuelMode: FuelMode;
}

export const DEFAULT_SETTINGS: CostSettings = { amortPerKm: 0.3, fuelPer100: 11, fuelPrice: 6.5, fuelMode: 'rate' };

export interface Rates {
  amortPerKm: number;
  fuelPerKm: number;
  /** откуда ставка бензина: из настроек или по фактическим заправкам года */
  fuelSource: 'settings' | 'refuels';
}

export interface RiderLike {
  memberId: string;
  guests: number;
}

export interface CostTrip {
  date: string;
  endDate: string | null;
  km: number;
  shared: boolean;
  riders: RiderLike[];
}

export interface RiderShare {
  memberId: string;
  guests: number;
  /** сам + гости */
  heads: number;
  km: number;
  days: number;
  amort: number;
  fuel: number;
}

export interface TripCost {
  heads: number;
  amort: number;
  fuel: number;
  total: number;
  /** с человека (0 — поездка по делам буса) */
  perHead: number;
  riders: RiderShare[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Стоимость поездки и доли участников. year — считать дни только этого года. */
export function tripCost(t: CostTrip, rates: Pick<Rates, 'amortPerKm' | 'fuelPerKm'>, year?: string): TripCost {
  const amort = t.km * rates.amortPerKm;
  const fuel = t.km * rates.fuelPerKm;
  const heads = t.shared ? 0 : t.riders.reduce((s, r) => s + 1 + r.guests, 0);
  const days = tripDays(t).filter((d) => !year || d.startsWith(`${year}-`)).length;
  const riders = t.riders.map((r) => {
    const h = 1 + r.guests;
    const part = heads ? h / heads : 0;
    return {
      memberId: r.memberId,
      guests: r.guests,
      heads: h,
      km: t.km * part,
      days: heads ? days / t.riders.length : 0,
      amort: amort * part,
      fuel: fuel * part,
    };
  });
  return { heads, amort, fuel, total: amort + fuel, perHead: heads ? (amort + fuel) / heads : 0, riders };
}

/**
 * Ставка бензина. В режиме учёта заправок — по факту года: всё заплаченное за бензин / все км года
 * (тогда доли поездок в сумме равны заплаченному, и долги сходятся в ноль). Пока заправок нет — по настройкам.
 */
export function ratesFor(s: CostSettings, year: { refuelAmount: number; km: number }): Rates {
  const byRate = (s.fuelPer100 / 100) * s.fuelPrice;
  if (s.fuelMode === 'refuels' && year.refuelAmount > 0 && year.km > 0)
    return { amortPerKm: s.amortPerKm, fuelPerKm: year.refuelAmount / year.km, fuelSource: 'refuels' };
  return { amortPerKm: s.amortPerKm, fuelPerKm: byRate, fuelSource: 'settings' };
}

export interface MemberMoney {
  memberId: string;
  km: number;
  days: number;
  trips: number;
  guests: number;
  amort: number;
  fuel: number;
}

export interface MoneySummary {
  members: MemberMoney[];
  /** общая касса: поездки по делам буса */
  fund: { km: number; amort: number; fuel: number };
}

/** Итоги года по владельцам и кассе. */
export function moneySummary(trips: CostTrip[], rates: Rates, year: string): MoneySummary {
  const by = new Map<string, MemberMoney>();
  const fund = { km: 0, amort: 0, fuel: 0 };
  for (const t of trips) {
    const c = tripCost(t, rates, year);
    if (t.shared || !c.heads) {
      fund.km += t.km;
      fund.amort += c.amort;
      fund.fuel += c.fuel;
      continue;
    }
    for (const r of c.riders) {
      let m = by.get(r.memberId);
      if (!m) by.set(r.memberId, (m = { memberId: r.memberId, km: 0, days: 0, trips: 0, guests: 0, amort: 0, fuel: 0 }));
      m.km += r.km;
      m.days += r.days;
      m.trips += 1;
      m.guests += r.guests;
      m.amort += r.amort;
      m.fuel += r.fuel;
    }
  }
  const members = [...by.values()]
    .map((m) => ({ ...m, km: round2(m.km), days: round2(m.days), amort: round2(m.amort), fuel: round2(m.fuel) }))
    .sort((a, b) => b.km - a.km);
  return { members, fund: { km: fund.km, amort: round2(fund.amort), fuel: round2(fund.fuel) } };
}

/** Счёт в учёте бензина: владелец или общая касса (id = null). */
export interface FuelAccount {
  id: string | null;
  /** заплатил на заправках, zł */
  paid: number;
  /** израсходовал по поездкам, zł */
  used: number;
  sent: number;
  received: number;
  /** > 0 — ему должны, < 0 — он должен */
  balance: number;
}

export interface Settlement {
  from: string | null;
  to: string | null;
  amount: number;
}

const key = (id: string | null) => id ?? '__fund';

/**
 * Учёт бензина: кто сколько заплатил на заправках и сколько израсходовал по своим поездкам (вместе с
 * гостями), плюс переводы между собой. Предлагает минимум переводов, чтобы всех рассчитать.
 */
export function fuelLedger(
  summary: MoneySummary,
  refuels: { paidBy: string | null; amount: number }[],
  transfers: { fromId: string | null; toId: string | null; amount: number }[],
): { accounts: FuelAccount[]; settlements: Settlement[] } {
  const acc = new Map<string, FuelAccount>();
  const get = (id: string | null) => {
    let a = acc.get(key(id));
    if (!a) acc.set(key(id), (a = { id, paid: 0, used: 0, sent: 0, received: 0, balance: 0 }));
    return a;
  };
  for (const m of summary.members) get(m.memberId).used += m.fuel;
  if (summary.fund.fuel) get(null).used += summary.fund.fuel;
  for (const r of refuels) get(r.paidBy).paid += r.amount;
  for (const t of transfers) {
    get(t.fromId).sent += t.amount;
    get(t.toId).received += t.amount;
  }
  const accounts = [...acc.values()].map((a) => {
    const balance = round2(a.paid - a.used + a.sent - a.received);
    return { ...a, paid: round2(a.paid), used: round2(a.used), balance };
  });

  // жадно: самый большой долг гасим самому большому кредитору; мелочь до 1 zł не гоняем
  const debtors = accounts.filter((a) => a.balance <= -1).map((a) => ({ id: a.id, left: -a.balance }));
  const creditors = accounts.filter((a) => a.balance >= 1).map((a) => ({ id: a.id, left: a.balance }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const settlements: Settlement[] = [];
  for (const d of debtors)
    for (const c of creditors) {
      if (d.left < 1) break;
      if (c.left < 1) continue;
      const amount = Math.round(Math.min(d.left, c.left));
      if (amount < 1) continue;
      settlements.push({ from: d.id, to: c.id, amount });
      d.left -= amount;
      c.left -= amount;
    }
  return { accounts, settlements };
}
