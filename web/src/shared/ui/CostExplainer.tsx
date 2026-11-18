// «Как посчитано»: формула поездки по строкам — откуда ставка, откуда топливо, на сколько делим.
// Живёт внутри чёрной таблички стоимости, свёрнут по умолчанию.
import type {
  CostSettings,
  FuelInterval,
  RatePeriod,
  TripExtras,
  TripRates,
} from '@shared/api/types';
import { FUEL_TYPES, type PreviewCost } from '@shared/lib/cost';
import { dec, guestsLabel, longDate, num, plural, zl, zlRate } from '@shared/lib/format';
import { useState } from 'react';
import { Glyph } from './Pictogram';

const DEFAULT_FROM = '2000-01-01';
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function periodLine(period: RatePeriod) {
  if (period.validFrom <= DEFAULT_FROM)
    return 'ставка по умолчанию — админ может уточнить в «Деньгах»';
  return `ставка с ${longDate(period.validFrom)}${period.createdBy ? `, задал(а) ${period.createdBy}` : ''}`;
}

export function CostExplainer({
  km,
  cost,
  rates,
  period,
  interval,
  settings,
  shared,
  extras,
  nameOf,
}: {
  km: number;
  cost: PreviewCost;
  rates: TripRates;
  period: RatePeriod;
  interval?: FuelInterval;
  settings: CostSettings;
  shared: boolean;
  extras: Omit<TripExtras, 'amount'> | null;
  nameOf: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const fuel = FUEL_TYPES[settings.fuelType];
  const basisSum = period.basis?.items.reduce((s, i) => s + i.perYear, 0) ?? 0;

  const fuelSource =
    rates.source === 'period' ? (
      <>
        {dec(rates.per100)} {fuel.unit}/100 км × {zlRate(rates.unitPrice)} за {fuel.unitWord} —{' '}
        {periodLine(period)}
      </>
    ) : interval ? (
      <>
        {rates.source === 'refuels-nearest' &&
          'Этот бак ещё не закрыт полной заправкой — пока по прошлому. '}
        По заправкам: от полного бака на {num(interval.fromOdo)} до полного на {num(interval.toOdo)}{' '}
        км залили {dec(interval.units)} {fuel.unit} на {zl(interval.amount)}
        {' → '}
        {dec(interval.per100)} {fuel.unit}/100 км
      </>
    ) : null;

  return (
    <details
      className="explain"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span>Как посчитано</span>
        <Glyph name={open ? 'minus' : 'plus'} size={18} />
      </summary>
      <dl className="explain__rows">
        <div>
          <dt>Амортизация</dt>
          <dd>
            {num(km)} км × {zlRate(rates.amortPerKm)}
          </dd>
          <b>{zl(cost.amort)}</b>
          <p>
            Износ, ТО, шины и потеря стоимости — копится в кассу.{' '}
            {period.basis
              ? `${zl(basisSum)} в год ÷ ${num(period.basis.kmPerYear)} км в год; ${periodLine(period)}.`
              : `${cap(periodLine(period))}.`}
          </p>
        </div>
        <div>
          <dt>Топливо, {fuel.label.toLowerCase()}</dt>
          <dd>
            {num(km)} км × {zlRate(rates.fuelPerKm)}
          </dd>
          <b>{zl(cost.fuel)}</b>
          {fuelSource && <p>{fuelSource}.</p>}
        </div>
        {cost.extras > 0 && (
          <div>
            <dt>Расходы в дороге</dt>
            <dd>{extras?.note || 'дороги, парковки'}</dd>
            <b>{zl(cost.extras)}</b>
            <p>
              {extras?.paidBy
                ? `Заплатил(а) ${nameOf(extras.paidBy)} — ${
                    settings.fuelMode === 'refuels'
                      ? 'остальные доли вернут через «Деньги».'
                      : 'остальные отдают свои доли на месте.'
                  }`
                : shared
                  ? 'Из кассы.'
                  : 'Вскладчину на месте — каждый за свою долю.'}
            </p>
          </div>
        )}
        <div className="explain__total">
          <dt>Итого</dt>
          <b>{zl(cost.total)}</b>
        </div>
      </dl>
      <p className="explain__split">
        {shared
          ? 'По делам буса — всё на кассу: никому лично не записывается.'
          : `Делим поровну на ${cost.heads} ${plural(cost.heads, 'человека', 'человека', 'человек')}: ${cost.riders
              .map((r) =>
                r.absent
                  ? `${nameOf(r.memberId)} — ${r.heads} ${plural(r.heads, 'доля', 'доли', 'долей')} за ${guestsLabel(r.guests)}, сам(а) не ехал(а)`
                  : `${nameOf(r.memberId)} — ${r.heads} ${plural(r.heads, 'доля', 'доли', 'долей')}${r.guests ? ` (сам(а) и ${guestsLabel(r.guests)})` : ''}`,
              )
              .join('; ')}. Гости — на том, кто позвал.`}
      </p>
    </details>
  );
}
