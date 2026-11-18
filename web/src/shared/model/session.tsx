// Кто вошёл и список участников — нужны почти на каждом экране; держит кэш React Query.
import { queries, useRefresh } from '@shared/api/queries';
import type { Member, Viewer } from '@shared/api/types';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface Session {
  viewer: Viewer | null;
  members: Member[];
  /** участник по id (включая выбывших — для истории) */
  memberById: Map<string, Member>;
  loading: boolean;
  error: string | null;
  /** после правки участников: имена и счётчики поездок есть и в журнале, и в деньгах */
  reloadMembers: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
const NONE: Member[] = [];

export function SessionProvider({ children }: { children: ReactNode }) {
  const me = useQuery(queries.me());
  const list = useQuery(queries.members());
  const refresh = useRefresh();
  const members = list.data ?? NONE;
  const failed = me.error ?? list.error;
  // ошибка важна, только пока показывать нечего: фоновый сбой не должен закрывать журнал
  const error = failed && (!me.data || !list.data) ? failed.message : null;

  const value = useMemo(
    () => ({
      viewer: me.data ?? null,
      members,
      memberById: new Map(members.map((m) => [m.id, m])),
      loading: me.isPending || list.isPending,
      error,
      reloadMembers: refresh,
    }),
    [me.data, members, me.isPending, list.isPending, error, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession вне SessionProvider');
  return s;
}

/** Имя для подписи поездки. */
export const whoLabel = (memberId: string | null, byId: Map<string, Member>) =>
  memberId === null ? 'Общая поездка' : (byId.get(memberId)?.name ?? 'Участник удалён');
