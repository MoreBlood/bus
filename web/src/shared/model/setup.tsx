// Состояние установки (/api/setup): облако или локально, настроен ли вход, кто вошёл.
import { fetchSetup } from '@shared/api/client';
import type { Setup } from '@shared/api/types';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

const Ctx = createContext<Setup | null>(null);

/** undefined — грузится, null — не удалось получить. */
export function useSetupLoader() {
  const [setup, setSetup] = useState<Setup | null | undefined>(undefined);
  useEffect(() => {
    fetchSetup()
      .then(setSetup)
      .catch(() => setSetup(null));
  }, []);
  return setup;
}

export function SetupProvider({ value, children }: { value: Setup | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSetup = () => useContext(Ctx);
