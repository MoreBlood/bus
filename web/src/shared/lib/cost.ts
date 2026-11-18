// Предпросмотр стоимости поездки в мастере — та же формула, что на сервере (src/service/costs.ts).
import type { Rates, Rider } from '@shared/api/types';

export function previewCost(
  km: number,
  shared: boolean,
  riders: Rider[],
  rates: Pick<Rates, 'amortPerKm' | 'fuelPerKm'>,
) {
  const amort = km * rates.amortPerKm;
  const fuel = km * rates.fuelPerKm;
  const heads = shared ? 0 : riders.reduce((s, r) => s + 1 + r.guests, 0);
  return {
    amort,
    fuel,
    total: amort + fuel,
    heads,
    perHead: heads ? (amort + fuel) / heads : 0,
    riders: riders.map((r) => ({
      ...r,
      total: heads ? ((amort + fuel) * (1 + r.guests)) / heads : 0,
    })),
  };
}
