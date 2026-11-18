// Типы ответов API (зеркало src/service/* на сервере).

export interface Viewer {
  login: string | null;
  memberId: string | null;
  isAdmin: boolean;
  envAdmin: boolean;
}

export interface Member {
  id: string;
  name: string;
  githubLogin: string | null;
  isAdmin: boolean;
  active: boolean;
  sort: number;
  /** админ из переменной окружения ADMIN_GITHUB_USERS */
  envAdmin: boolean;
  trips: number;
}

export interface Rider {
  memberId: string;
  /** гости, которых он позвал: их доля записывается на него */
  guests: number;
  /** сам не ехал — отдал бус гостям: доли только у гостей, день — его */
  absent?: boolean;
}

export interface RiderShare extends Rider {
  absent: boolean;
  /** сколько долей на нём: он сам (если ехал) + гости */
  heads: number;
  km: number;
  days: number;
  amort: number;
  fuel: number;
  extras: number;
}

export type FuelMode = 'rate' | 'refuels';
export type FuelType = 'diesel' | 'petrol' | 'lpg' | 'electric';

export interface CostSettings {
  fuelMode: FuelMode;
  fuelType: FuelType;
}

/** Из чего сложена ставка амортизации: статьи в zł за год и пробег в год. */
export interface AmortBasis {
  items: { label: string; perYear: number }[];
  kmPerYear: number;
}

/** Ставки, действующие с даты: прошлые поездки считаются по своим периодам. */
export interface RatePeriod {
  id: string;
  validFrom: string;
  amortPerKm: number;
  /** расход на 100 км в единицах топлива (л или кВт·ч) */
  fuelPer100: number;
  /** цена единицы топлива, zł */
  fuelPrice: number;
  basis: AmortBasis | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** Ставки конкретной поездки и откуда они взялись. */
export interface TripRates {
  amortPerKm: number;
  fuelPerKm: number;
  per100: number;
  unitPrice: number;
  /** period — по ставке периода; refuels — по заправкам этого бака; refuels-nearest — по ближайшему баку */
  source: 'period' | 'refuels' | 'refuels-nearest';
  periodFrom: string;
}

export interface TripCost {
  heads: number;
  amort: number;
  fuel: number;
  extras: number;
  total: number;
  perHead: number;
  riders: RiderShare[];
  rates: TripRates;
}

export interface TripExtras {
  /** zł */
  amount: number;
  /** null — вскладчину на месте (каждый за свою долю) */
  paidBy: string | null;
  note: string;
}

export interface Trip {
  id: string;
  date: string;
  endDate: string | null;
  /** по делам буса: платит общая касса */
  shared: boolean;
  riders: Rider[];
  /** дороги, парковки, паром — сверх км */
  extras: TripExtras | null;
  cost: TripCost;
  km: number;
  odoStart: number | null;
  odoEnd: number | null;
  note: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
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
  fund: {
    km: number;
    amort: number;
    fuel: number;
    extras: number;
    /** км по разрывам одометра: никто не записал — везёт касса */
    unrecordedKm: number;
    unrecorded: number;
    unrecordedFuel: number;
  };
}

/** Отрезок между двумя полными баками. */
export interface FuelInterval {
  fromOdo: number;
  toOdo: number;
  fromDate: string;
  toDate: string;
  units: number;
  amount: number;
  km: number;
  perKm: number;
  per100: number;
  unitPrice: number;
}

export interface OdometerIssue {
  kind: 'gap' | 'overlap';
  afterId: string;
  beforeId: string;
  fromOdo: number;
  toOdo: number;
  km: number;
  date: string;
}

export interface Journal {
  year: string;
  years: string[];
  trips: Trip[];
  summary: MoneySummary & {
    totalKm: number;
    personalKm: number;
    sharedKm: number;
    trips: number;
    guests: number;
  };
  /** ставки на сегодня */
  rates: TripRates;
  settings: CostSettings;
  periods: RatePeriod[];
  /** отрезки между полными баками (все годы) */
  intervals: FuelInterval[];
  issues: OdometerIssue[];
  lastOdometer: { km: number; date: string } | null;
}

export interface Refuel {
  id: string;
  date: string;
  odometer: number | null;
  liters: number;
  /** zł */
  amount: number;
  /** null — из общей кассы */
  paidBy: string | null;
  full: boolean;
  note: string;
  createdBy: string | null;
}

export interface Transfer {
  id: string;
  date: string;
  fromId: string | null;
  toId: string | null;
  amount: number;
  note: string;
}

export interface FuelAccount {
  id: string | null;
  paid: number;
  used: number;
  sent: number;
  received: number;
  balance: number;
}

export interface Settlement {
  from: string | null;
  to: string | null;
  amount: number;
}

export type RepairKind = 'service' | 'repair' | 'tires' | 'other' | 'upgrade';

/** Как поделён ремонт: из резерва по износу, поровну на владельцев или на виновника. */
export interface RepairSplit {
  shares: { memberId: string; amount: number }[];
  fromReserve: number;
  overflow: number;
  how: 'reserve' | 'owners' | 'charged';
}

export interface Repair {
  id: string;
  date: string;
  odometer: number | null;
  kind: RepairKind;
  title: string;
  /** zł */
  amount: number;
  /** null — из общей кассы */
  paidBy: string | null;
  /** по вине участника — вся сумма на нём */
  chargedTo: string | null;
  note: string;
  createdBy: string | null;
  updatedBy: string | null;
  split?: RepairSplit | null;
}

export interface RepairInput {
  date: string;
  odometer: number | null;
  kind: RepairKind;
  title: string;
  amount: number;
  paidBy: string | null;
  chargedTo: string | null;
  note: string;
}

/** Резерв на ремонт: амортизация, которую каждый начислил своими км, минус то, что ушло на ремонты. */
export interface Reserve {
  accrued: number;
  spent: number;
  left: number;
  overflow: number;
  members: { memberId: string; accrued: number; spent: number; left: number }[];
}

export interface Money {
  year: string;
  years: string[];
  settings: CostSettings;
  periods: RatePeriod[];
  /** ставки на сегодня */
  rates: TripRates;
  summary: MoneySummary;
  /** кто кому должен: топливо (в учёте заправок), ремонты, переводы; null — делить нечего */
  ledger: { accounts: FuelAccount[]; settlements: Settlement[] } | null;
  repairsByMember: { memberId: string; amount: number }[];
  reserve: Reserve;
  /** ремонты из резерва за 12 месяцев на все км за это время */
  fact: { from: string; km: number; spent: number; perKm: number | null };
  repairs: Repair[];
  /** отрезки между полными баками этого года */
  intervals: FuelInterval[];
  refuels: Refuel[];
  transfers: Transfer[];
}

export interface PeriodInput {
  validFrom: string;
  amortPerKm: number;
  fuelPer100: number;
  fuelPrice: number;
  basis: AmortBasis | null;
}

export interface RefuelInput {
  date: string;
  odometer: number | null;
  liters: number;
  amount: number;
  paidBy: string | null;
  full: boolean;
  note: string;
}

export interface Setup {
  /** облачная установка: вход через GitHub */
  auth: boolean;
  /** заданы GITHUB_CLIENT_ID / SECRET / ADMIN_GITHUB_USERS (или вход не нужен) */
  authConfigured: boolean;
  login: string | null;
  baseUrl: string;
  mcpUrl: string;
  /** callback для OAuth App на GitHub */
  githubCallbackUrl: string;
  /** превью PR: демо-данные, вход выключен */
  demo: boolean;
  version: string;
  commit: string | null;
  /** номер PR для превью */
  pr: string | null;
  branch: string | null;
}

export interface TripInput {
  date: string;
  endDate: string | null;
  shared: boolean;
  riders: Rider[];
  odoStart: number | null;
  odoEnd: number | null;
  km: number | null;
  note: string;
  extras?: TripExtras | null;
}

export interface MemberInput {
  name?: string;
  githubLogin?: string | null;
  isAdmin?: boolean;
  active?: boolean;
}
