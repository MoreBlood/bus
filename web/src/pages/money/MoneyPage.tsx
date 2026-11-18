// Деньги буса: сколько стоит километр, кто сколько должен за год, ставки, заправки и переводы.

import { SettleUntil } from '@features/settle-until/SettleUntil';
import { Select } from '@radix-ui/themes';
import { createTransfer, deleteTransfer, errorText, fetchMoney } from '@shared/api/client';
import type { FuelMode, Money } from '@shared/api/types';
import { FUEL_TYPES, periodFor } from '@shared/lib/cost';
import {
  daysFrac,
  dec,
  guestsLabel,
  longDate,
  num,
  shortDate,
  today,
  zl,
  zlRate,
} from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignLink } from '@shared/ui/SignButton';
import { RatesSection } from '@widgets/rates/RatesSection';
import { RepairsSection } from '@widgets/repairs/RepairsSection';
import { Topbar } from '@widgets/topbar/Topbar';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

// главная цифра полосы — до копейки, без третьего знака
const dec2 = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const MODE_LABEL: Record<FuelMode, string> = { rate: 'бак на бак', refuels: 'учёт заправок' };

export function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? undefined;
  const { memberById, viewer } = useSession();
  const [m, setM] = useState<Money | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const account = (id: string) => m?.ledger?.accounts.find((a) => a.id === id);
  // год целиком до отметки «рассчитались до» — показать, что долгов нет не по ошибке
  const settledYear = !!m?.settings.settledUntil && `${m.year}-12-31` <= m.settings.settledUntil;
  const repairOf = (id: string) => m?.repairsByMember.find((r) => r.memberId === id)?.amount ?? 0;
  // пришли из мастера ремонта (/money#repairs-title) — показать раздел
  const { hash } = useLocation();
  useEffect(() => {
    if (m && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [m, hash]);
  const fuel = m ? FUEL_TYPES[m.settings.fuelType] : FUEL_TYPES.diesel;
  // откуда цена км сегодня — одной строкой под цифрой
  const bandMeta = (() => {
    if (!m) return '\u00a0';
    const r = m.rates;
    const from = periodFor(m.periods, today()).validFrom;
    const fuelPart =
      r.source === 'period'
        ? `${dec(r.per100)} ${fuel.unit}/100 × ${zlRate(r.unitPrice)}`
        : 'по последнему полному баку';
    return `амортизация ${zlRate(r.amortPerKm)} + топливо ${zlRate(r.fuelPerKm)} (${fuel.label.toLowerCase()}, ${fuelPart}) · ${MODE_LABEL[m.settings.fuelMode]}${from > '2000-01-01' ? ` · ставки с ${longDate(from)}` : ''}`;
  })();

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
              {m ? dec2(perKm) : '0,00'}
              <span className="odo-sign__unit">zł</span>
            </span>
            <span className="odo-sign__meta">
              {bandMeta}
              {m && (
                <>
                  {' · '}
                  <a className="band-link" href="#rates-title">
                    как посчитано
                  </a>
                </>
              )}
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

          {m && (m.ledger || settledYear) && (
            <section className="section" aria-labelledby="settle-title">
              <h2 className="section__title" id="settle-title" style={{ marginBottom: 10 }}>
                Кто кому должен
              </h2>
              {!m.ledger ? (
                <p className="prose">За {m.year} все рассчитались.</p>
              ) : m.ledger.settlements.length ? (
                <ul className="people">
                  {m.ledger.settlements.map((s) => (
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
              <SettleUntil
                settledUntil={m.settings.settledUntil ?? null}
                isAdmin={!!viewer?.isAdmin}
                onSaved={load}
              />
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
              {m.summary.members.length === 0 && m.summary.fund.km === 0 ? (
                <p className="prose">
                  Поездок за {m.year} нет — суммы появятся после первой записи.
                </p>
              ) : (
                <>
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
                                <span>топливо {zl(x.fuel)}</span>
                                {x.extras > 0 && <span>в дороге {zl(x.extras)}</span>}
                                {repairOf(x.memberId) > 0 && (
                                  <span>ремонты {zl(repairOf(x.memberId))}</span>
                                )}
                                {a && <span>заплатил {zl(a.paid)}</span>}
                              </div>
                            </div>
                            <div className="money-row__sum">
                              <b>{zl(x.amort + x.fuel + x.extras)}</b>
                              {a && Math.abs(a.balance) >= 1 && (
                                <small className={a.balance > 0 ? 'is-plus' : 'is-minus'}>
                                  {a.balance > 0
                                    ? `ему ${zl(a.balance)}`
                                    : `с него ${zl(-a.balance)}`}
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
                            <span>топливо {zl(m.summary.fund.fuel)}</span>
                            {m.summary.fund.extras > 0 && (
                              <span>в дороге {zl(m.summary.fund.extras)}</span>
                            )}
                          </div>
                          {m.summary.fund.unrecordedKm > 0 && (
                            <div className="person__meta">
                              <span>
                                и {num(m.summary.fund.unrecordedKm)} км никто не записал —{' '}
                                {zl(m.summary.fund.unrecorded)}
                              </span>
                              <Link
                                className="inline-link"
                                to={m.year === m.years[0] ? '/' : `/?year=${m.year}`}
                              >
                                к разрывам
                              </Link>
                            </div>
                          )}
                        </div>
                        <div className="money-row__sum">
                          <b>
                            {zl(
                              m.summary.fund.amort +
                                m.summary.fund.fuel +
                                m.summary.fund.extras +
                                m.summary.fund.unrecorded,
                            )}
                          </b>
                        </div>
                      </div>
                    </li>
                  </ul>
                  <p className="field__hint">
                    Амортизация — износ: копится в резерв на ремонт, из него платят за поломки.{' '}
                    {m.settings.fuelMode === 'rate'
                      ? 'Топливо в режиме «бак на бак» делят в самой поездке — здесь оно для справки.'
                      : 'Топливо и расходы в дороге — по факту: долги выше.'}{' '}
                    Км, которые никто не записал, везёт касса, пока их не запишут поездкой.
                  </p>
                </>
              )}
            </section>
          )}

          {m && <RepairsSection money={m} name={name} />}

          {m && <RatesSection money={m} isAdmin={!!viewer?.isAdmin} onChanged={load} />}

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
                            {dec(r.liters)} {fuel.unit} · {name(r.paidBy)}
                            {r.createdBy === 'demo' && (
                              <>
                                {' '}
                                <span className="tag tag--muted demo-tag">демо</span>
                              </>
                            )}
                          </span>
                          <span className="trip-row__meta">
                            {shortDate(r.date)} · {zlRate(r.amount / r.liters)}/{fuel.unit}
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
            </section>
          )}

          {m?.ledger && m.transfers.length > 0 && (
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
