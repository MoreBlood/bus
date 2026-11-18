// Деньги буса: сколько стоит километр, кто сколько должен за год, ставки, заправки и переводы.
import { SegmentedControl, Select } from '@radix-ui/themes';
import {
  createTransfer,
  deleteTransfer,
  errorText,
  fetchMoney,
  saveSettings,
} from '@shared/api/client';
import type { CostSettings, FuelMode, Money } from '@shared/api/types';
import { daysFrac, dec, guestsLabel, num, shortDate, today, zl, zlRate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton, SignLink } from '@shared/ui/SignButton';
import { Topbar } from '@widgets/topbar/Topbar';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const MODE_LABEL: Record<FuelMode, string> = { rate: 'Бак на бак', refuels: 'Учёт заправок' };

function RatesEditor({ settings, onSaved }: { settings: CostSettings; onSaved: () => void }) {
  const ids = { amort: useId(), per100: useId(), price: useId() };
  const [amort, setAmort] = useState(String(settings.amortPerKm));
  const [per100, setPer100] = useState(String(settings.fuelPer100));
  const [price, setPrice] = useState(String(settings.fuelPrice));
  const [mode, setMode] = useState<FuelMode>(settings.fuelMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = (s: string) => Number(s.replace(',', '.'));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveSettings({
        amortPerKm: n(amort),
        fuelPer100: n(per100),
        fuelPrice: n(price),
        fuelMode: mode,
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
        <span className="field__label">Бензин считаем</span>
        <SegmentedControl.Root
          size="3"
          value={mode}
          onValueChange={(v) => setMode(v as FuelMode)}
          style={{ width: '100%' }}
        >
          <SegmentedControl.Item value="rate">Бак на бак</SegmentedControl.Item>
          <SegmentedControl.Item value="refuels">Учёт заправок</SegmentedControl.Item>
        </SegmentedControl.Root>
        <p className="field__hint">
          {mode === 'rate'
            ? 'Бус возвращают с тем же уровнем топлива; бензин делят в поездке по ставке.'
            : 'Заправки записываются; бензин — по факту, кто платил на кассе, тому возвращают.'}
        </p>
      </div>
      <div className="odo-pair" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <label htmlFor={ids.amort}>Амортизация, zł/км</label>
          <input
            id={ids.amort}
            className="num-input"
            inputMode="decimal"
            value={amort}
            onChange={(e) => setAmort(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.per100}>Расход, л/100</label>
          <input
            id={ids.per100}
            className="num-input"
            inputMode="decimal"
            value={per100}
            onChange={(e) => setPer100(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.price}>Литр, zł</label>
          <input
            id={ids.price}
            className="num-input"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <div className="notice notice--error" role="alert">
          <Pictogram name="warning" size={32} />
          <span>{error}</span>
        </div>
      )}
      <SignButton type="submit" size="md" loading={busy}>
        Сохранить ставки
      </SignButton>
    </form>
  );
}

export function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? undefined;
  const { memberById, viewer } = useSession();
  const [m, setM] = useState<Money | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMoney(year)
      .then((x) => {
        setM(x);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, [year]);
  useEffect(load, [load]);

  const name = (id: string | null) =>
    id === null ? 'Касса' : (memberById.get(id)?.name ?? 'Участник удалён');
  const settle = async (from: string | null, to: string | null, amount: number) => {
    const k = `${from}-${to}`;
    setPaying(k);
    try {
      await createTransfer({ date: today(), fromId: from, toId: to, amount });
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPaying(null);
    }
  };

  const perKm = m ? m.rates.amortPerKm + m.rates.fuelPerKm : 0;
  const account = (id: string) => m?.fuel?.accounts.find((a) => a.id === id);

  return (
    <>
      <Topbar section="Деньги">
        {m && (
          <Select.Root
            value={m.year}
            onValueChange={(y) => setParams(y === m.years[0] ? {} : { year: y })}
          >
            <Select.Trigger className="year-select" aria-label="Год" />
            <Select.Content position="popper">
              {m.years.map((y) => (
                <Select.Item key={y} value={y}>
                  {y}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      </Topbar>

      <section className="band" aria-label="Стоимость километра">
        <div className="band__inner band__inner--journal">
          <div className="odo-sign">
            <Pictogram name="pump" size={48} />
            <span className="odo-sign__label">Километр стоит</span>
            <span className="odo-sign__value">
              {m ? zlRate(perKm).replace(' zł', '') : '0,00'}
              <span className="odo-sign__unit">zł</span>
            </span>
            <span className="odo-sign__meta">
              {m
                ? `амортизация ${zlRate(m.rates.amortPerKm)} + бензин ${zlRate(m.rates.fuelPerKm)}${
                    m.rates.fuelSource === 'refuels'
                      ? ' по заправкам'
                      : ` (${dec(m.settings.fuelPer100)} л/100 км × ${zlRate(m.settings.fuelPrice)})`
                  } · ${MODE_LABEL[m.settings.fuelMode].toLowerCase()}`
                : ' '}
            </span>
          </div>
          <div className="band__cta">
            <SignLink to="/refuels/new" tone="black" icon="pump">
              Записать заправку
            </SignLink>
          </div>
        </div>
      </section>

      <div className="page">
        <div className="narrow">
          {error && (
            <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
              <Pictogram name="warning" size={32} />
              <span>{error}</span>
            </div>
          )}
          {!m && !error && (
            <div
              className="skeleton"
              aria-busy
              aria-label="Загрузка"
              style={{ height: 320, marginTop: 24 }}
            />
          )}

          {m?.fuel && (
            <section className="section" aria-labelledby="settle-title">
              <h2 className="section__title" id="settle-title" style={{ marginBottom: 10 }}>
                Кто кому должен за бензин
              </h2>
              {m.fuel.settlements.length ? (
                <ul className="people">
                  {m.fuel.settlements.map((s) => (
                    <li key={`${s.from}-${s.to}`} className="person">
                      <div className="person__row">
                        <Pictogram name="arrow" size={40} />
                        <div>
                          <div className="person__name">
                            {name(s.from)} → {name(s.to)}
                          </div>
                          <div className="person__meta">{zl(s.amount)}</div>
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          disabled={paying === `${s.from}-${s.to}`}
                          onClick={() => settle(s.from, s.to, s.amount)}
                        >
                          Рассчитались
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="prose">Все в расчёте.</p>
              )}
            </section>
          )}

          {m && (
            <section className="section" aria-labelledby="owners-title">
              <div className="section__head">
                <h2 className="section__title" id="owners-title">
                  За {m.year} год
                </h2>
                <span className="section__aside">с гостями</span>
              </div>
              <ul className="people">
                {m.summary.members.map((x) => {
                  const a = account(x.memberId);
                  return (
                    <li key={x.memberId} className="person">
                      <div className="money-row">
                        <div>
                          <div className="person__name">
                            {name(x.memberId)}
                            {x.memberId === viewer?.memberId && (
                              <span className="totals__me">вы</span>
                            )}
                          </div>
                          <div className="person__meta">
                            <span>{num(x.km)} км</span>
                            <span>{daysFrac(x.days)}</span>
                            {x.guests > 0 && <span>{guestsLabel(x.guests)}</span>}
                          </div>
                          <div className="person__meta">
                            <span>амортизация {zl(x.amort)}</span>
                            <span>бензин {zl(x.fuel)}</span>
                            {a && <span>заплатил {zl(a.paid)}</span>}
                          </div>
                        </div>
                        <div className="money-row__sum">
                          <b>{zl(x.amort + x.fuel)}</b>
                          {a && Math.abs(a.balance) >= 1 && (
                            <small className={a.balance > 0 ? 'is-plus' : 'is-minus'}>
                              {a.balance > 0 ? `ему ${zl(a.balance)}` : `с него ${zl(-a.balance)}`}
                            </small>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
                <li className="person">
                  <div className="money-row">
                    <div>
                      <div className="person__name">Касса — по делам буса</div>
                      <div className="person__meta">
                        <span>{num(m.summary.fund.km)} км</span>
                        <span>амортизация {zl(m.summary.fund.amort)}</span>
                        <span>бензин {zl(m.summary.fund.fuel)}</span>
                      </div>
                    </div>
                    <div className="money-row__sum">
                      <b>{zl(m.summary.fund.amort + m.summary.fund.fuel)}</b>
                    </div>
                  </div>
                </li>
              </ul>
              <p className="field__hint">
                Амортизация копится в кассу на ремонт и износ.{' '}
                {m.settings.fuelMode === 'rate'
                  ? 'Бензин в режиме «бак на бак» делят в самой поездке — здесь он для справки.'
                  : 'Бензин — по заправкам: долги выше.'}
              </p>
            </section>
          )}

          {m && (
            <section className="section" aria-labelledby="rates-title">
              <div className="section__head">
                <h2 className="section__title" id="rates-title">
                  Ставки
                </h2>
                {viewer?.isAdmin && !editing && (
                  <button type="button" className="text-button" onClick={() => setEditing(true)}>
                    Изменить
                  </button>
                )}
              </div>
              {editing ? (
                <RatesEditor
                  settings={m.settings}
                  onSaved={() => {
                    setEditing(false);
                    load();
                  }}
                />
              ) : (
                <dl className="review">
                  <div>
                    <dt>Амортизация</dt>
                    <dd>{zlRate(m.settings.amortPerKm)} за км</dd>
                  </div>
                  <div>
                    <dt>Бензин по ставке</dt>
                    <dd>
                      {dec(m.settings.fuelPer100)} л/100 км × {zlRate(m.settings.fuelPrice)}
                    </dd>
                  </div>
                  <div>
                    <dt>Режим</dt>
                    <dd>{MODE_LABEL[m.settings.fuelMode]}</dd>
                  </div>
                  {m.consumption && (
                    <div>
                      <dt>Расход по заправкам</dt>
                      <dd>{dec(m.consumption)} л/100 км</dd>
                    </div>
                  )}
                </dl>
              )}
            </section>
          )}

          {m && (
            <section className="section" aria-labelledby="refuels-title">
              <div className="section__head">
                <h2 className="section__title" id="refuels-title">
                  Заправки
                </h2>
                <span className="section__aside">{m.refuels.length || 'пока нет'}</span>
              </div>
              {m.refuels.length > 0 && (
                <ul className="feed">
                  {m.refuels.map((r) => (
                    <li key={r.id}>
                      <Link to={`/refuels/${r.id}`} className="trip-row">
                        <Pictogram name="pump" size={40} />
                        <span className="trip-row__main">
                          <span className="trip-row__title">
                            {dec(r.liters)} л · {name(r.paidBy)}
                            {r.createdBy === 'demo' && (
                              <>
                                {' '}
                                <span className="tag tag--muted demo-tag">демо</span>
                              </>
                            )}
                          </span>
                          <span className="trip-row__meta">
                            {shortDate(r.date)} · {zlRate(r.amount / r.liters)}/л
                            {r.odometer ? ` · ${num(r.odometer)} км` : ''}
                            {r.full ? ' · полный бак' : ''}
                          </span>
                        </span>
                        <span className="trip-row__km">
                          {num(r.amount)}
                          <small>zł</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 16, maxWidth: 360 }} className="money-cta">
                <SignLink to="/refuels/new" size="md" icon="pump">
                  Записать заправку
                </SignLink>
              </div>
            </section>
          )}

          {m?.fuel && m.transfers.length > 0 && (
            <section className="section" aria-labelledby="transfers-title">
              <h2 className="section__title" id="transfers-title" style={{ marginBottom: 10 }}>
                Переводы
              </h2>
              <ul className="people">
                {m.transfers.map((t) => (
                  <li key={t.id} className="person">
                    <div className="person__row">
                      <Pictogram name="arrow" size={40} />
                      <div>
                        <div className="person__name">
                          {name(t.fromId)} → {name(t.toId)}
                        </div>
                        <div className="person__meta">
                          {shortDate(t.date)} · {zl(t.amount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => deleteTransfer(t.id).then(load)}
                      >
                        Отменить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
