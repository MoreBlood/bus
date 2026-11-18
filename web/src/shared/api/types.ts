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
}

export interface RiderShare extends Rider {
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
  perHead: number;
  riders: RiderShare[];
}

export interface Trip {
  id: string;
  date: string;
  endDate: string | null;
  /** по делам буса: платит общая касса */
  shared: boolean;
  riders: Rider[];
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

export type FuelMode = 'rate' | 'refuels';

export interface CostSettings {
  amortPerKm: number;
  fuelPer100: number;
  fuelPrice: number;
  fuelMode: FuelMode;
}

export interface Rates {
  amortPerKm: number;
  fuelPerKm: number;
  fuelSource: 'settings' | 'refuels';
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
  fund: { km: number; amort: number; fuel: number };
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
  rates: Rates;
  settings: CostSettings;
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

export interface Money {
  year: string;
  years: string[];
  settings: CostSettings;
  rates: Rates;
  summary: MoneySummary;
  fuel: { accounts: FuelAccount[]; settlements: Settlement[] } | null;
  consumption: number | null;
  refuels: Refuel[];
  transfers: Transfer[];
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
}

export interface MemberInput {
  name?: string;
  githubLogin?: string | null;
  isAdmin?: boolean;
  active?: boolean;
}
