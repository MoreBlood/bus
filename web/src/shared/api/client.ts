import type {
  CostSettings,
  Journal,
  Member,
  MemberInput,
  Money,
  PeriodInput,
  Refuel,
  RefuelInput,
  Repair,
  RepairInput,
  Setup,
  TripInput,
  Viewer,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Облачная установка без сессии → на вход, затем обратно на эту страницу. */
function signInIfNeeded(res: Response) {
  if (res.status !== 401) return;
  const back = window.location.pathname + window.location.search;
  window.location.href = `/sign-in?callbackURL=${encodeURIComponent(back)}`;
}

async function handle<T>(res: Response): Promise<T> {
  signInIfNeeded(res);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {}
    throw new ApiError(message || `Ошибка ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

const get = <T>(url: string) => fetch(url).then((r) => handle<T>(r));
const post = <T>(url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r));

export const fetchSetup = () => get<Setup>('/api/setup');
export const fetchMe = () => get<Viewer>('/api/me');

export const fetchJournal = (year?: string) =>
  get<Journal>(year ? `/api/journal?year=${year}` : '/api/journal');
export const createTrip = (b: TripInput) => post<{ id: string }>('/api/trips', b);
export const updateTrip = (id: string, b: TripInput) =>
  post<{ ok: boolean }>('/api/trips/update', { id, ...b });
export const deleteTrip = (id: string) => post<{ ok: boolean }>('/api/trips/delete', { id });

export const fetchMembers = () => get<Member[]>('/api/members');
export const createMember = (b: MemberInput) => post<{ id: string }>('/api/members', b);
export const updateMember = (id: string, b: MemberInput) =>
  post<{ ok: boolean }>('/api/members/update', { id, ...b });
export const deleteMember = (id: string) => post<{ ok: boolean }>('/api/members/delete', { id });

/** Ошибка → текст для человека. */
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Что-то пошло не так. Попробуйте ещё раз.';

export const fetchTrip = (id: string) => get<import('./types').Trip>(`/api/trips/${id}`);

export interface AssistantStatus {
  mcpUrl: string;
  /** локальная установка: подключается только Claude Code на этом компьютере */
  local: boolean;
  /** превью PR: MCP открыт без входа, данные демо */
  demo: boolean;
  connections: { clientId: string; name: string; since: string | null }[];
}
export const fetchAssistant = () => get<AssistantStatus>('/api/assistant');

// --- деньги ---
export const fetchMoney = (year?: string) =>
  get<Money>(year ? `/api/money?year=${year}` : '/api/money');
export const saveSettings = (b: Partial<CostSettings>) => post<CostSettings>('/api/settings', b);
export const savePeriod = (b: PeriodInput) =>
  post<{ ok: boolean; validFrom: string }>('/api/rates', b);
export const deletePeriod = (id: string) => post<{ ok: boolean }>('/api/rates/delete', { id });
export const fetchRefuel = (id: string) => get<Refuel>(`/api/refuels/${id}`);
export const createRefuel = (b: RefuelInput) => post<{ id: string }>('/api/refuels', b);
export const updateRefuel = (id: string, b: RefuelInput) =>
  post<{ ok: boolean }>('/api/refuels/update', { id, ...b });
export const deleteRefuel = (id: string) => post<{ ok: boolean }>('/api/refuels/delete', { id });
export const fetchRepair = (id: string) => get<Repair>(`/api/repairs/${id}`);
export const createRepair = (b: RepairInput) => post<{ id: string }>('/api/repairs', b);
export const updateRepair = (id: string, b: RepairInput) =>
  post<{ ok: boolean }>('/api/repairs/update', { id, ...b });
export const deleteRepair = (id: string) => post<{ ok: boolean }>('/api/repairs/delete', { id });
export const createTransfer = (b: {
  date: string;
  fromId: string | null;
  toId: string | null;
  amount: number;
}) => post<{ id: string }>('/api/transfers', b);
export const deleteTransfer = (id: string) =>
  post<{ ok: boolean }>('/api/transfers/delete', { id });
