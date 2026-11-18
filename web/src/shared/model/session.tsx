// Кто вошёл и список участников — нужны почти на каждом экране, грузим один раз.
import { fetchMe, fetchMembers } from '@shared/api/client';
import type { Member, Viewer } from '@shared/api/types';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface Session {
  viewer: Viewer | null;
  members: Member[];
  /** участник по id (включая выбывших — для истории) */
  memberById: Map<string, Member>;
  loading: boolean;
  error: string | null;
  reloadMembers: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadMembers = useCallback(async () => {
    setMembers(await fetchMembers());
  }, []);

  useEffect(() => {
    Promise.all([fetchMe(), fetchMembers()])
      .then(([v, m]) => {
        setViewer(v);
        setMembers(m);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      viewer,
      members,
      memberById: new Map(members.map((m) => [m.id, m])),
      loading,
      error,
      reloadMembers,
    }),
    [viewer, members, loading, error, reloadMembers],
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
