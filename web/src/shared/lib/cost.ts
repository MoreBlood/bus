// Предпросмотр стоимости поездки в мастере — та же формула, что на сервере (src/service/costs.ts):
// ставки по дате поездки, топливо по полным бакам, доли поровну на всех в машине.
import type {
  CostSettings,
  FuelInterval,
  FuelType,
  RatePeriod,
  Rider,
  TripRates,
} from '@shared/api/types';

export const FUEL_TYPES: Record<FuelType, { label: string; unit: string; unitWord: string }> = {
  diesel: { label: 'Дизель', unit: 'л', unitWord: 'литр' },
  petrol: { label: 'Бензин', unit: 'л', unitWord: 'литр' },
  lpg: { label: 'Газ (LPG)', unit: 'л', unitWord: 'литр' },
  electric: { label: 'Электричество', unit: 'кВт·ч', unitWord: 'кВт·ч' },
};

/** Период, действующий на дату. periods — по возрастанию validFrom. */
export function periodFor(periods: RatePeriod[], date: string) {
  let found = periods[0];
  for (const p of periods) if (p.validFrom <= date) found = p;
  return found;
}

export function tripRates(
  t: { date: string; odoStart: number | null; odoEnd: number | null },
  periods: RatePeriod[],
  s: CostSettings,
  intervals: FuelInterval[],
): TripRates {
  const p = periodFor(periods, t.date);
  const base = { amortPerKm: p.amortPerKm, periodFrom: p.validFrom };
  if (s.fuelMode === 'refuels' && intervals.length) {
    const mid = t.odoStart !== null && t.odoEnd !== null ? (t.odoStart + t.odoEnd) / 2 : null;
    let iv =
      mid !== null
        ? intervals.find((i) => mid >= i.fromOdo && mid <= i.toOdo)
        : intervals.find((i) => t.date >= i.fromDate && t.date <= i.toDate);
    let source: TripRates['source'] = 'refuels';
    if (!iv) {
      const before = intervals.filter((i) => (mid !== null ? i.toOdo <= mid : i.toDate <= t.date));
      iv = before.at(-1) ?? intervals[0];
      source = 'refuels-nearest';
    }
    return {
      ...base,
      fuelPerKm: iv.perKm,
      per100: iv.per100,
      unitPrice: iv.unitPrice,
      source,
    };
  }
  return {
    ...base,
    fuelPerKm: (p.fuelPer100 / 100) * p.fuelPrice,
    per100: p.fuelPer100,
    unitPrice: p.fuelPrice,
    source: 'period',
  };
}

/** Отрезок между полными баками, по которому посчитано топливо поездки. */
export function intervalFor(
  t: { date: string; odoStart: number | null; odoEnd: number | null },
  intervals: FuelInterval[],
) {
  const mid = t.odoStart !== null && t.odoEnd !== null ? (t.odoStart + t.odoEnd) / 2 : null;
  const inside =
    mid !== null
      ? intervals.find((i) => mid >= i.fromOdo && mid <= i.toOdo)
      : intervals.find((i) => t.date >= i.fromDate && t.date <= i.toDate);
  if (inside) return inside;
  const before = intervals.filter((i) => (mid !== null ? i.toOdo <= mid : i.toDate <= t.date));
  return before.at(-1) ?? intervals[0];
}

/** Сколько долей на участнике: он сам (если ехал) + его гости. */
export const headsOf = (r: Rider) => (r.absent ? 0 : 1) + r.guests;

export function previewCost(
  km: number,
  shared: boolean,
  riders: Rider[],
  rates: Pick<TripRates, 'amortPerKm' | 'fuelPerKm'>,
  extras = 0,
) {
  const amort = km * rates.amortPerKm;
  const fuel = km * rates.fuelPerKm;
  const total = amort + fuel + extras;
  const heads = shared ? 0 : riders.reduce((s, r) => s + headsOf(r), 0);
  return {
    amort,
    fuel,
    extras,
    total,
    heads,
    perHead: heads ? total / heads : 0,
    riders: riders.map((r) => ({
      ...r,
      heads: headsOf(r),
      total: heads ? (total * headsOf(r)) / heads : 0,
    })),
  };
}

export type PreviewCost = ReturnType<typeof previewCost>;

/** Статьи амортизации по умолчанию: что изнашивается и дорожает с каждым км. */
export const AMORT_ITEMS = (fuel: FuelType) => [
  { label: 'ТО и масло', perYear: 1500 },
  { label: 'Шины', perYear: 800 },
  { label: 'Ремонт и резерв', perYear: 2000 },
  { label: 'Потеря стоимости', perYear: 3000 },
  ...(fuel === 'diesel' ? [{ label: 'AdBlue', perYear: 300 }] : []),
];

export const amortFromBasis = (b: { items: { perYear: number }[]; kmPerYear: number }) =>
  b.kmPerYear > 0
    ? Math.round((b.items.reduce((s, i) => s + i.perYear, 0) / b.kmPerYear) * 1000) / 1000
    : 0;
