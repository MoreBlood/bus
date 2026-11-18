// Деньги поездок — чистые функции без базы (тесты в costs.test.ts).
//
// Стоимость поездки = км × (амортизация + топливо) за км + расходы поездки (дороги, парковки).
// Делится поровну на всех в машине: владельцы и их гости; доля гостя — на пригласившем; если хозяин сам
// не ехал (бус отдан гостям), его собственной доли нет. Поездка «по делам буса» (shared) — на общей кассе.
// Дни пользования делятся между владельцами в поездке; гости дней не занимают.
//
// Ставки берутся из периода, в который попала поездка (rate_periods), — смена цены не переписывает прошлое.
// В режиме учёта заправок топливо считается по полным бакам: стоимость бака / км, проеханные на нём.
import { tripDays } from './journal.ts';

export type FuelMode = 'rate' | 'refuels';
export type FuelType = 'diesel' | 'petrol' | 'lpg' | 'electric';

export const FUEL_TYPES: Record<FuelType, { label: string; unit: string }> = {
  diesel: { label: 'Дизель', unit: 'л' },
  petrol: { label: 'Бензин', unit: 'л' },
  lpg: { label: 'Газ (LPG)', unit: 'л' },
  electric: { label: 'Электричество', unit: 'кВт·ч' },
};

/** Общие настройки (не зависят от даты). */
export interface CostSettings {
  /** rate — бак на бак: топливо делят в поездке по ставке; refuels — учёт заправок и долгов */
  fuelMode: FuelMode;
  fuelType: FuelType;
}

export const DEFAULT_SETTINGS: CostSettings = { fuelMode: 'rate', fuelType: 'diesel' };

/** Из чего сложена ставка амортизации: статьи в zł за год и пробег в год. */
export interface AmortBasis {
  items: { label: string; perYear: number }[];
  kmPerYear: number;
}

export interface RatePeriod {
  id: string;
  /** с какой даты действует (YYYY-MM-DD) */
  validFrom: string;
  /** амортизация, zł за км: износ, ТО, шины, потеря стоимости, AdBlue */
  amortPerKm: number;
  /** расход на 100 км в единицах топлива (л или кВт·ч) */
  fuelPer100: number;
  /** цена единицы топлива, zł */
  fuelPrice: number;
  basis: AmortBasis | null;
  createdBy: string | null;
  createdAt: string | null;
}

export const DEFAULT_PERIOD: RatePeriod = {
  id: 'default',
  validFrom: '2000-01-01',
  amortPerKm: 0.3,
  fuelPer100: 11,
  fuelPrice: 6.5,
  basis: null,
  createdBy: null,
  createdAt: null,
};

/** Период, действующий на дату. periods — по возрастанию validFrom. */
export function periodFor(periods: RatePeriod[], date: string): RatePeriod {
  let found = periods[0] ?? DEFAULT_PERIOD;
  for (const p of periods) if (p.validFrom <= date) found = p;
  return found;
}

/** Отрезок между двумя полными баками: сколько залили, заплатили и проехали. */
export interface FuelInterval {
  fromOdo: number;
  toOdo: number;
  fromDate: string;
  toDate: string;
  /** залито за отрезок (единицы топлива), включая закрывающую полную заправку */
  units: number;
  /** заплачено, zł */
  amount: number;
  km: number;
  perKm: number;
  per100: number;
  unitPrice: number;
}

interface RefuelLike {
  date: string;
  odometer: number | null;
  liters: number;
  /** zł */
  amount: number;
  full: boolean;
}

/**
 * Отрезки «полный бак → полный бак» по заправкам с одометром. Всё, что залили между двумя полными
 * баками (включая второй), израсходовано на этих км — так получается честный расход и цена километра.
 */
export function fuelIntervals(refuels: RefuelLike[]): FuelInterval[] {
  const withOdo = refuels.filter((r) => r.odometer !== null).sort((a, b) => a.odometer! - b.odometer! || a.date.localeCompare(b.date));
  const out: FuelInterval[] = [];
  let start: RefuelLike | null = null;
  let units = 0;
  let amount = 0;
  for (const r of withOdo) {
    if (start) {
      units += r.liters;
      amount += r.amount;
    }
    if (!r.full) continue;
    if (start && r.odometer! > start.odometer!) {
      const km = r.odometer! - start.odometer!;
      out.push({
        fromOdo: start.odometer!,
        toOdo: r.odometer!,
        fromDate: start.date,
        toDate: r.date,
        units,
        amount,
        km,
        perKm: amount / km,
        per100: (units / km) * 100,
        unitPrice: units ? amount / units : 0,
      });
    }
    start = r;
    units = 0;
    amount = 0;
  }
  return out;
}

/** Ставки конкретной поездки и откуда они взялись — для объяснения «как посчитано». */
export interface TripRates {
  amortPerKm: number;
  fuelPerKm: number;
  per100: number;
  unitPrice: number;
  /** period — по ставке периода; refuels — по заправкам этого отрезка; refuels-nearest — по ближайшему отрезку */
  source: 'period' | 'refuels' | 'refuels-nearest';
  periodFrom: string;
}

interface TripPlace {
  date: string;
  odoStart: number | null;
  odoEnd: number | null;
}

export function tripRates(t: TripPlace, periods: RatePeriod[], s: CostSettings, intervals: FuelInterval[]): TripRates {
  const p = periodFor(periods, t.date);
  const base = { amortPerKm: p.amortPerKm, periodFrom: p.validFrom };
  if (s.fuelMode === 'refuels' && intervals.length) {
    const mid = t.odoStart !== null && t.odoEnd !== null ? (t.odoStart + t.odoEnd) / 2 : null;
    let iv =
      mid !== null
        ? intervals.find((i) => mid >= i.fromOdo && mid <= i.toOdo)
        : intervals.find((i) => t.date >= i.fromDate && t.date <= i.toDate);
    let source: TripRates['source'] = 'refuels';
    if (!iv) {
      // открытый бак (после последней полной заправки) или до первой — по ближайшему отрезку
      const before = intervals.filter((i) => (mid !== null ? i.toOdo <= mid : i.toDate <= t.date));
      iv = before.at(-1) ?? intervals[0];
      source = 'refuels-nearest';
    }
    return { ...base, fuelPerKm: iv.perKm, per100: iv.per100, unitPrice: iv.unitPrice, source };
  }
  return { ...base, fuelPerKm: (p.fuelPer100 / 100) * p.fuelPrice, per100: p.fuelPer100, unitPrice: p.fuelPrice, source: 'period' };
}

export interface RiderLike {
  memberId: string;
  guests: number;
  /** сам не ехал — бус отдан гостям */
  absent?: boolean;
}

export interface CostTrip {
  date: string;
  endDate: string | null;
  km: number;
  shared: boolean;
  riders: RiderLike[];
  /** расходы поездки сверх км, zł */
  extras?: number;
}

export interface RiderShare {
  memberId: string;
  guests: number;
  absent: boolean;
  /** сколько долей на нём: он сам (если ехал) + гости */
  heads: number;
  km: number;
  days: number;
  amort: number;
  fuel: number;
  extras: number;
}

export interface TripCost {
  heads: number;
  amort: number;
  fuel: number;
  extras: number;
  total: number;
  /** с человека (0 — поездка по делам буса) */
  perHead: number;
  riders: RiderShare[];
  rates: Pick<TripRates, 'amortPerKm' | 'fuelPerKm'> & Partial<TripRates>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Стоимость поездки и доли участников. year — считать дни только этого года. */
export function tripCost(t: CostTrip, rates: Pick<TripRates, 'amortPerKm' | 'fuelPerKm'> & Partial<TripRates>, year?: string): TripCost {
  const amort = t.km * rates.amortPerKm;
  const fuel = t.km * rates.fuelPerKm;
  const extras = t.extras ?? 0;
  const own = (r: RiderLike) => (r.absent ? 0 : 1) + r.guests;
  const heads = t.shared ? 0 : t.riders.reduce((s, r) => s + own(r), 0);
  const days = tripDays(t).filter((d) => !year || d.startsWith(`${year}-`)).length;
  const total = amort + fuel + extras;
  const riders = t.riders.map((r) => {
    const h = own(r);
    const part = heads ? h / heads : 0;
    return {
      memberId: r.memberId,
      guests: r.guests,
      absent: !!r.absent,
      heads: h,
      km: t.km * part,
      // бус занят: день — тем владельцам, кто его взял (ехал сам или отдал гостям)
      days: heads ? days / t.riders.length : 0,
      amort: amort * part,
      fuel: fuel * part,
      extras: extras * part,
    };
  });
  return { heads, amort, fuel, extras, total, perHead: heads ? total / heads : 0, riders, rates };
}

export interface MemberMoney {
  memberId: string;
  km: number;
  days: number;
  trips: number;
  guests: number;
  amort: number;
  fuel: number;
  extras: number;
}

export interface MoneySummary {
  members: MemberMoney[];
  /** общая касса: поездки по делам буса и км, которые никто не записал */
  fund: {
    km: number;
    amort: number;
    fuel: number;
    extras: number;
    /** км по разрывам одометра — их тоже везёт касса */
    unrecordedKm: number;
    unrecorded: number;
    unrecordedFuel: number;
  };
}

/** Итоги года по владельцам и кассе. Поездки — уже с посчитанной стоимостью. */
export function moneySummary(
  trips: (CostTrip & { cost: TripCost })[],
  unrecorded: { km: number; cost: number; fuel: number } = { km: 0, cost: 0, fuel: 0 },
): MoneySummary {
  const by = new Map<string, MemberMoney>();
  const fund = { km: 0, amort: 0, fuel: 0, extras: 0 };
  for (const t of trips) {
    const c = t.cost;
    if (t.shared || !c.heads) {
      fund.km += t.km;
      fund.amort += c.amort;
      fund.fuel += c.fuel;
      fund.extras += c.extras;
      continue;
    }
    for (const r of c.riders) {
      let m = by.get(r.memberId);
      if (!m) by.set(r.memberId, (m = { memberId: r.memberId, km: 0, days: 0, trips: 0, guests: 0, amort: 0, fuel: 0, extras: 0 }));
      m.km += r.km;
      m.days += r.days;
      m.trips += 1;
      m.guests += r.guests;
      m.amort += r.amort;
      m.fuel += r.fuel;
      m.extras += r.extras;
    }
  }
  const members = [...by.values()]
    .map((m) => ({ ...m, km: round2(m.km), days: round2(m.days), amort: round2(m.amort), fuel: round2(m.fuel), extras: round2(m.extras) }))
    .sort((a, b) => b.km - a.km);
  return {
    members,
    fund: {
      km: fund.km,
      amort: round2(fund.amort),
      fuel: round2(fund.fuel),
      extras: round2(fund.extras),
      unrecordedKm: unrecorded.km,
      unrecorded: round2(unrecorded.cost),
      unrecordedFuel: round2(unrecorded.fuel),
    },
  };
}

/** Счёт в учёте расходов поездок: владелец или общая касса (id = null). */
export interface FuelAccount {
  id: string | null;
  /** заплатил: заправки и расходы поездок, zł */
  paid: number;
  /** израсходовал по поездкам (топливо и расходы поездок), zł */
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
 * Учёт заправок: кто сколько заплатил (заправки и расходы поездок) и сколько израсходовал по своим
 * поездкам (вместе с гостями), плюс переводы. Предлагает минимум переводов, чтобы всех рассчитать.
 * Топливо, оставшееся в баке после последней полной заправки, ещё никем не израсходовано — поэтому
 * сумма балансов может быть не ноль: её «держит» бак.
 */
export function fuelLedger(
  summary: MoneySummary,
  paid: { paidBy: string | null; amount: number }[],
  transfers: { fromId: string | null; toId: string | null; amount: number }[],
): { accounts: FuelAccount[]; settlements: Settlement[] } {
  const acc = new Map<string, FuelAccount>();
  const get = (id: string | null) => {
    let a = acc.get(key(id));
    if (!a) acc.set(key(id), (a = { id, paid: 0, used: 0, sent: 0, received: 0, balance: 0 }));
    return a;
  };
  for (const m of summary.members) get(m.memberId).used += m.fuel + m.extras;
  // касса: поездки по делам буса и топливо км, которые никто не записал (кто-то же его залил)
  const fundUsed = summary.fund.fuel + summary.fund.extras + summary.fund.unrecordedFuel;
  if (fundUsed) get(null).used += fundUsed;
  for (const r of paid) get(r.paidBy).paid += r.amount;
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

/** Ставка амортизации из статей: сумма в год / км в год. */
export const amortFromBasis = (b: AmortBasis) =>
  b.kmPerYear > 0 ? Math.round((b.items.reduce((s, i) => s + i.perYear, 0) / b.kmPerYear) * 1000) / 1000 : 0;
