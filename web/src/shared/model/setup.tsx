// Состояние установки (/api/setup): облако или локально, настроен ли вход, кто вошёл.
import { queries } from '@shared/api/queries';
import type { Setup } from '@shared/api/types';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';

const Ctx = createContext<Setup | null>(null);

/** undefined — грузится, null — не удалось получить. */
export function useSetupLoader(): Setup | null | undefined {
  const q = useQuery({ ...queries.setup(), retry: false });
  return q.isPending ? undefined : (q.data ?? null);
}

export function SetupProvider({ value, children }: { value: Setup | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSetup = () => useContext(Ctx);
