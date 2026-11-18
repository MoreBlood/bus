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

/** Счёт в учёте «кто кому должен»: владелец или общая касса (id = null). */
export interface FuelAccount {
  id: string | null;
  /** заплатил: заправки, расходы поездок, ремонты, zł */
  paid: number;
  /** несёт: топливо и расходы своих поездок, доли ремонтов, zł */
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

/** Сколько каждый израсходовал по поездкам в режиме учёта заправок: топливо и расходы в дороге. */
export function fuelUsed(summary: MoneySummary): { id: string | null; amount: number }[] {
  const used: { id: string | null; amount: number }[] = summary.members.map((m) => ({ id: m.memberId, amount: m.fuel + m.extras }));
  // касса: поездки по делам буса и топливо км, которые никто не записал (кто-то же его залил)
  const fund = summary.fund.fuel + summary.fund.extras + summary.fund.unrecordedFuel;
  if (fund) used.push({ id: null, amount: fund });
  return used;
}

/**
 * Кто кому должен: кто сколько заплатил (заправки, расходы поездок, ремонты) и сколько несёт (used: топливо по
 * своим поездкам вместе с гостями, доли ремонтов), плюс переводы. Предлагает минимум переводов.
 * Топливо, оставшееся в баке после последней полной заправки, ещё никем не израсходовано — поэтому
 * сумма балансов может быть не ноль: её «держит» бак.
 */
export function ledger(
  used: { id: string | null; amount: number }[],
  paid: { paidBy: string | null; amount: number }[],
  transfers: { fromId: string | null; toId: string | null; amount: number }[],
): { accounts: FuelAccount[]; settlements: Settlement[] } {
  const acc = new Map<string, FuelAccount>();
  const get = (id: string | null) => {
    let a = acc.get(key(id));
    if (!a) acc.set(key(id), (a = { id, paid: 0, used: 0, sent: 0, received: 0, balance: 0 }));
    return a;
  };
  for (const u of used) if (u.amount) get(u.id).used += u.amount;
  for (const r of paid) get(r.paidBy).paid += r.amount;
  for (const t of transfers) {
    get(t.fromId).sent += t.amount;
    get(t.toId).received += t.amount;
  }
  const accounts = [...acc.values()].map((a) => {
    const balance = round2(a.paid - a.used + a.sent - a.received);
    return { ...a, paid: round2(a.paid), used: round2(a.used), balance };
  });

  // жадно: самый большой долг гасим самому большому кредитору; мелочь до 1 zł не гоняем.
  // Касса — последней: сумма балансов не ноль (бак, неучтённые км), и люди должны рассчитаться между собой
  const debtors = accounts.filter((a) => a.balance <= -1).map((a) => ({ id: a.id, left: -a.balance }));
  const creditors = accounts.filter((a) => a.balance >= 1).map((a) => ({ id: a.id, left: a.balance }));
  const order = (a: { id: string | null; left: number }, b: { id: string | null; left: number }) =>
    Number(a.id === null) - Number(b.id === null) || b.left - a.left;
  debtors.sort(order);
  creditors.sort(order);
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

// ─── ремонт и ТО ──────────────────────────────────────────────────────────────

export type RepairKind = 'service' | 'repair' | 'tires' | 'other' | 'upgrade';

export const REPAIR_KINDS: Record<RepairKind, string> = {
  service: 'ТО',
  repair: 'Ремонт',
  tires: 'Шины',
  other: 'Прочее',
  upgrade: 'Улучшение',
};

export interface RepairLike {
  id: string;
  date: string;
  /** zł */
  amount: number;
  kind: RepairKind;
  /** поломка по вине участника — вся сумма на нём */
  chargedTo: string | null;
}

/** Как поделён ремонт: из резерва (по амортизации), поровну на владельцев или на виновника. */
export interface RepairSplit {
  shares: { memberId: string; amount: number }[];
  /** сколько взято из резерва */
  fromReserve: number;
  /** сколько не хватило в резерве — поровну на владельцев */
  overflow: number;
  how: 'reserve' | 'owners' | 'charged';
}

export interface ReserveMember {
  memberId: string;
  /** начислено амортизацией за всё время */
  accrued: number;
  /** ушло на ремонты из резерва */
  spent: number;
  /** осталось в резерве */
  left: number;
}

export interface Reserve {
  accrued: number;
  spent: number;
  left: number;
  /** ремонтов больше резерва — разделено поровну */
  overflow: number;
  members: ReserveMember[];
}

/**
 * Резерв на ремонт. Амортизация никуда не переводится: это износ, который каждый начислил своими км.
 * Ремонт за счёт кассы гасится из резерва — по всей истории до даты ремонта, пропорционально тому, кто сколько
 * начислил: кто больше ездит, тот больше и платит. Не хватило резерва — остаток поровну на владельцев.
 * Улучшение (бокс, кровать) — поровну на владельцев; поломка по вине — на виновника.
 */
export function repairShares(
  accruals: { date: string; memberId: string; amort: number }[],
  repairs: RepairLike[],
  owners: string[],
): { splits: Map<string, RepairSplit>; reserve: Reserve } {
  const acc = [...accruals].sort((a, b) => a.date.localeCompare(b.date));
  const reps = [...repairs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const left = new Map<string, number>();
  const accrued = new Map<string, number>();
  const spent = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  const equal = (amount: number) => (owners.length ? owners.map((id) => ({ memberId: id, amount: amount / owners.length })) : []);
  const splits = new Map<string, RepairSplit>();
  let i = 0;
  let overflowAll = 0;
  for (const r of reps) {
    // поездки этого дня и раньше уже начислили износ
    for (; i < acc.length && acc[i].date <= r.date; i++) {
      add(left, acc[i].memberId, acc[i].amort);
      add(accrued, acc[i].memberId, acc[i].amort);
    }
    if (r.chargedTo) {
      splits.set(r.id, { shares: [{ memberId: r.chargedTo, amount: r.amount }], fromReserve: 0, overflow: 0, how: 'charged' });
      continue;
    }
    if (r.kind === 'upgrade') {
      splits.set(r.id, { shares: equal(r.amount), fromReserve: 0, overflow: 0, how: 'owners' });
      continue;
    }
    const pool = [...left.values()].reduce((s, v) => s + Math.max(0, v), 0);
    const take = Math.min(r.amount, pool);
    const by = new Map<string, number>();
    if (take > 0)
      for (const [id, v] of left) {
        if (v <= 0) continue;
        const part = (take * v) / pool;
        add(by, id, part);
        left.set(id, v - part);
        add(spent, id, part);
      }
    const overflow = r.amount - take;
    for (const s of equal(overflow)) add(by, s.memberId, s.amount);
    overflowAll += overflow;
    splits.set(r.id, {
      shares: [...by].map(([memberId, amount]) => ({ memberId, amount: round2(amount) })),
      fromReserve: round2(take),
      overflow: round2(overflow),
      how: 'reserve',
    });
  }
  for (; i < acc.length; i++) {
    add(left, acc[i].memberId, acc[i].amort);
    add(accrued, acc[i].memberId, acc[i].amort);
  }
  const members = [...accrued.keys()]
    .map((memberId) => ({
      memberId,
      accrued: round2(accrued.get(memberId) ?? 0),
      spent: round2(spent.get(memberId) ?? 0),
      left: round2(left.get(memberId) ?? 0),
    }))
    .sort((a, b) => b.left - a.left);
  const sum = (k: 'accrued' | 'spent' | 'left') => round2(members.reduce((s, m) => s + m[k], 0));
  return { splits, reserve: { accrued: sum('accrued'), spent: sum('spent'), left: sum('left'), overflow: round2(overflowAll), members } };
}
