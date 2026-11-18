import type { Journal, Member, MemberInput, Setup, TripInput, Viewer } from './types';

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
