// Правка ставок (только админы): новый период «с даты» с помощником амортизации и общие настройки топлива.
import { SegmentedControl, TextField } from '@radix-ui/themes';
import { errorText, savePeriod, saveSettings } from '@shared/api/client';
import type {
  AmortBasis,
  CostSettings,
  FuelMode,
  FuelType,
  Money,
  RatePeriod,
} from '@shared/api/types';
import { AMORT_ITEMS, amortFromBasis, FUEL_TYPES } from '@shared/lib/cost';
import { num, today, zl, zlRate } from '@shared/lib/format';
import { Glyph, Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { type FormEvent, useId, useState } from 'react';

const n = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
const str = (v: number) => String(v).replace('.', ',');

function ErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="notice notice--error" role="alert">
      <Pictogram name="warning" size={32} />
      <span>{error}</span>
    </div>
  );
}

/** Помощник: из чего складывается амортизация — статьи в год ÷ км в год. */
function AmortHelper({
  fuelType,
  initial,
  onUse,
}: {
  fuelType: FuelType;
  initial: AmortBasis | null;
  onUse: (rate: number, basis: AmortBasis) => void;
}) {
  const kmId = useId();
  const [items, setItems] = useState(
    (initial?.items ?? AMORT_ITEMS(fuelType)).map((i) => ({ ...i, text: str(i.perYear) })),
  );
  const [kmText, setKmText] = useState(str(initial?.kmPerYear ?? 25000));
  const basis: AmortBasis = {
    items: items.map(({ label, text }) => ({ label, perYear: n(text) || 0 })),
    kmPerYear: n(kmText) || 0,
  };
  const sum = basis.items.reduce((s, i) => s + i.perYear, 0);
  const rate = amortFromBasis(basis);
  return (
    <div className="amort-helper">
      <ul className="amort-helper__items">
        {items.map((it, i) => (
          <li key={it.label}>
            <label htmlFor={`${kmId}-${i}`}>{it.label}</label>
            <span className="amort-helper__input">
              <input
                id={`${kmId}-${i}`}
                className="num-input num-input--sm"
                inputMode="decimal"
                value={it.text}
                onChange={(e) =>
                  setItems((xs) => xs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
              />
              <small>zł в год</small>
            </span>
          </li>
        ))}
        <li>
          <label htmlFor={kmId}>Пробег в год</label>
          <span className="amort-helper__input">
            <input
              id={kmId}
              className="num-input num-input--sm"
              inputMode="numeric"
              value={kmText}
              onChange={(e) => setKmText(e.target.value)}
            />
            <small>км</small>
          </span>
        </li>
      </ul>
      <div className="amort-helper__result">
        <span>
          {zl(sum)} ÷ {num(basis.kmPerYear)} км = <b>{zlRate(rate)}</b> за км
        </span>
        <button
          type="button"
          className="text-button"
          disabled={!rate}
          onClick={() => onUse(rate, basis)}
        >
          Взять {zlRate(rate)}
        </button>
      </div>
    </div>
  );
}

/** Новые ставки с даты: прошлые поездки остаются по своим ставкам. */
export function PeriodEditor({
  current,
  settings,
  fact,
  onSaved,
  onCancel,
}: {
  current: RatePeriod;
  settings: CostSettings;
  /** ремонты за 12 месяцев на км — ставка «по факту» */
  fact?: Money['fact'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const ids = { from: useId(), amort: useId(), per100: useId(), price: useId() };
  const fuel = FUEL_TYPES[settings.fuelType];
  const [from, setFrom] = useState(today());
  const [amort, setAmort] = useState(str(current.amortPerKm));
  const [basis, setBasis] = useState<AmortBasis | null>(current.basis);
  const [helper, setHelper] = useState(false);
  const [per100, setPer100] = useState(str(current.fuelPer100));
  const [price, setPrice] = useState(str(current.fuelPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await savePeriod({
        validFrom: from,
        amortPerKm: n(amort),
        fuelPer100: n(per100),
        fuelPrice: n(price),
        // ставку правили руками после помощника — статьи уже не про неё
        basis: basis && amortFromBasis(basis) === n(amort) ? basis : null,
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="person__editor" onSubmit={submit}>
      <div>
        <label className="field__label" htmlFor={ids.from}>
          Действуют с
        </label>
        <TextField.Root
          id={ids.from}
          className="date-input"
          type="date"
          size="3"
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <p className="field__hint">
          Поездки до этой даты останутся по прежним ставкам — пересчитаются только более поздние.
        </p>
      </div>

      <div>
        <div className="field-row">
          <label className="field__label" htmlFor={ids.amort}>
            Амортизация, zł за км
          </label>
          <button
            type="button"
            className="inline-link"
            aria-expanded={helper}
            onClick={() => setHelper((v) => !v)}
          >
            {helper ? 'Свернуть' : 'Посчитать по статьям'}
          </button>
        </div>
        <input
          id={ids.amort}
          className="num-input"
          inputMode="decimal"
          value={amort}
          onChange={(e) => setAmort(e.target.value)}
        />
        {helper ? (
          <AmortHelper
            fuelType={settings.fuelType}
            initial={basis}
            onUse={(rate, b) => {
              setAmort(str(rate));
              setBasis(b);
              setHelper(false);
            }}
          />
        ) : (
          <p className="field__hint">
            Износ, ТО, шины, ремонт и потеря стоимости на каждый км — копится в резерв на ремонт.
          </p>
        )}
        {!helper && fact?.perKm != null && (
          <div className="fact-row">
            <span>
              По факту ремонтов за 12 месяцев: {zl(fact.spent)} ÷ {num(fact.km)} км ={' '}
              <b>{zlRate(fact.perKm)}</b>
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setAmort(str(Math.round((fact.perKm ?? 0) * 1000) / 1000));
                setBasis(null);
              }}
            >
              Взять
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="odo-pair">
          <div>
            <label htmlFor={ids.per100}>Расход, {fuel.unit}/100 км</label>
            <input
              id={ids.per100}
              className="num-input"
              inputMode="decimal"
              value={per100}
              onChange={(e) => setPer100(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={ids.price}>{fuel.unit === 'л' ? 'Литр' : fuel.unit}, zł</label>
            <input
              id={ids.price}
              className="num-input"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>
        <p className="field__hint">
          {settings.fuelMode === 'refuels'
            ? 'В учёте заправок топливо считается по полным бакам; эти цифры — пока ни одного бака не закрыто.'
            : `${fuel.label}: сколько уходит на 100 км и почём ${fuel.unitWord} на заправке.`}
        </p>
      </div>

      <ErrorNotice error={error} />
      <div className="editor-actions">
        <SignButton type="submit" size="md" loading={busy}>
          Сохранить ставки
        </SignButton>
        <button type="button" className="inline-link" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

const MODE_HINT: Record<FuelMode, string> = {
  rate: 'Бус возвращают с тем же уровнем топлива: поездку делят на месте по ставке, заправки не записывают.',
  refuels:
    'Заправки записывают: топливо считается по полным бакам, кто платил — тому возвращают переводами.',
};

/** Общие настройки: чем заправляем и как делим топливо. */
export function FuelEditor({
  settings,
  onSaved,
  onCancel,
}: {
  settings: CostSettings;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<FuelType>(settings.fuelType);
  const [mode, setMode] = useState<FuelMode>(settings.fuelMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ fuelType: type, fuelMode: mode });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="person__editor" onSubmit={submit}>
      <div>
        <span className="field__label">Топливо</span>
        <div className="who who--two" role="radiogroup" aria-label="Топливо">
          {(Object.keys(FUEL_TYPES) as FuelType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className="who__option"
              onClick={() => setType(t)}
            >
              {type === t && <Glyph name="check" size={18} />}
              <span>{FUEL_TYPES[t].label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="field__label">Как делим топливо</span>
        <SegmentedControl.Root
          size="3"
          value={mode}
          onValueChange={(v) => setMode(v as FuelMode)}
          style={{ width: '100%' }}
        >
          <SegmentedControl.Item value="rate">Бак на бак</SegmentedControl.Item>
          <SegmentedControl.Item value="refuels">Учёт заправок</SegmentedControl.Item>
        </SegmentedControl.Root>
        <p className="field__hint">{MODE_HINT[mode]}</p>
      </div>
      <ErrorNotice error={error} />
      <div className="editor-actions">
        <SignButton type="submit" size="md" loading={busy}>
          Сохранить
        </SignButton>
        <button type="button" className="inline-link" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
