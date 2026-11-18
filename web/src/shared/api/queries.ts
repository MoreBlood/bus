// Данные с сервера через React Query: открытый раз экран снова показывается сразу из кэша
// и тихо обновляется в фоне — без скелетонов и нулей при переключении вкладок.
import {
  keepPreviousData,
  QueryClient,
  queryOptions,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  ApiError,
  fetchAssistant,
  fetchJournal,
  fetchMe,
  fetchMembers,
  fetchMoney,
  fetchRefuel,
  fetchRepair,
  fetchSetup,
  fetchTrip,
} from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // друзья пишут в тот же журнал: старше 30 секунд — перечитываем при открытии и при возврате во вкладку
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      // 4xx не лечится повтором: 401 уводит на вход, 404 — записи нет
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
  },
});

export const queries = {
  setup: () => queryOptions({ queryKey: ['setup'], queryFn: fetchSetup, staleTime: Infinity }),
  me: () => queryOptions({ queryKey: ['me'], queryFn: fetchMe }),
  members: () => queryOptions({ queryKey: ['members'], queryFn: fetchMembers }),
  assistant: () => queryOptions({ queryKey: ['assistant'], queryFn: fetchAssistant }),
  journal: (year?: string) =>
    queryOptions({ queryKey: ['journal', year ?? null], queryFn: () => fetchJournal(year) }),
  money: (year?: string) =>
    queryOptions({ queryKey: ['money', year ?? null], queryFn: () => fetchMoney(year) }),
  trip: (id: string) =>
    queryOptions({ queryKey: ['record', 'trip', id], queryFn: () => fetchTrip(id) }),
  refuel: (id: string) =>
    queryOptions({ queryKey: ['record', 'refuel', id], queryFn: () => fetchRefuel(id) }),
  repair: (id: string) =>
    queryOptions({ queryKey: ['record', 'repair', id], queryFn: () => fetchRepair(id) }),
};

/** Журнал и деньги по годам: при смене года прежний остаётся на экране, пока грузится новый. */
export const useJournal = (year?: string) =>
  useQuery({ ...queries.journal(year), placeholderData: keepPreviousData });
export const useMoney = (year?: string) =>
  useQuery({ ...queries.money(year), placeholderData: keepPreviousData });

/**
 * После записи: поездки, заправки, ремонты, ставки и участники влияют друг на друга, поэтому
 * устаревшим помечается всё, кроме установки. Что на экране — перечитывается сразу (можно дождаться),
 * остальное — когда откроют.
 */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'setup' }),
    [qc],
  );
}

/**
 * Данные для мастера: начальные значения (одометр, ставки) он берёт один раз, поэтому ждём,
 * пока устаревший кэш перечитается; свежий отдаём сразу. Дальше данные не прячутся на фоновых обновлениях.
 */
export function useSettled<T>(q: UseQueryResult<T>): T | undefined {
  const [settled, setSettled] = useState(false);
  if (!settled && q.data !== undefined && !q.isFetching) setSettled(true);
  return settled ? q.data : undefined;
}
