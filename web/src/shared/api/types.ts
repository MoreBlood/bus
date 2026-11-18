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

export interface Trip {
  id: string;
  date: string;
  endDate: string | null;
  /** null — общая поездка */
  memberId: string | null;
  km: number;
  odoStart: number | null;
  odoEnd: number | null;
  note: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MemberTotals {
  memberId: string;
  km: number;
  days: number;
  trips: number;
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
  summary: {
    totalKm: number;
    personalKm: number;
    sharedKm: number;
    trips: number;
    members: MemberTotals[];
  };
  issues: OdometerIssue[];
  lastOdometer: { km: number; date: string } | null;
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
  memberId: string | null;
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
