// Ставки: чем заправляем и как делим, периоды ставок «с даты» и полные баки — откуда цена топлива.
import { FuelEditor, PeriodEditor } from '@features/rates-editor/RatesEditor';
import { AlertDialog, Button, Flex } from '@radix-ui/themes';
import { deletePeriod, errorText } from '@shared/api/client';
import type { Money, RatePeriod } from '@shared/api/types';
import { FUEL_TYPES, periodFor } from '@shared/lib/cost';
import { dec, longDate, num, shortDate, today, zl, zlRate } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { useState } from 'react';

const MODE_LABEL = { rate: 'бак на бак', refuels: 'учёт заправок' } as const;
const DEFAULT_FROM = '2000-01-01';

export function RatesSection({
  money: m,
  isAdmin,
  onChanged,
}: {
  money: Money;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<'period' | 'fuel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fuel = FUEL_TYPES[m.settings.fuelType];
  const current = periodFor(m.periods, today());
  const periods = [...m.periods].reverse();
  const done = () => {
    setEditing(null);
    onChanged();
  };
  const remove = async (p: RatePeriod) => {
    try {
      await deletePeriod(p.id);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className="section" aria-labelledby="rates-title">
      <div className="section__head">
        <h2 className="section__title" id="rates-title">
          Ставки
        </h2>
        {isAdmin && !editing && (
          <button type="button" className="text-button" onClick={() => setEditing('period')}>
            Новые ставки
          </button>
        )}
      </div>

      {editing === 'period' ? (
        <PeriodEditor
          current={current}
          settings={m.settings}
          onSaved={done}
          onCancel={() => setEditing(null)}
        />
      ) : editing === 'fuel' ? (
        <FuelEditor settings={m.settings} onSaved={done} onCancel={() => setEditing(null)} />
      ) : (
        <>
          <ul className="people">
            <li className="person">
              <div className="person__row person__row--plain">
                <div>
                  <div className="person__name">
                    {fuel.label}, {MODE_LABEL[m.settings.fuelMode]}
                  </div>
                  <div className="person__meta">
                    {m.settings.fuelMode === 'rate'
                      ? 'топливо делят на месте, бус возвращают с тем же уровнем'
                      : 'топливо — по полным бакам, кто платил — тому вернут'}
                  </div>
                </div>
                {isAdmin && (
                  <button type="button" className="text-button" onClick={() => setEditing('fuel')}>
                    Изменить
                  </button>
                )}
              </div>
            </li>
            {periods.map((p) => {
              const isCurrent = p.id === current.id;
              const basisSum = p.basis?.items.reduce((s, i) => s + i.perYear, 0) ?? 0;
              return (
                <li key={p.id} className="person">
                  <div className="person__row person__row--plain">
                    <div>
                      <div className="person__name">
                        {p.validFrom <= DEFAULT_FROM
                          ? 'С самого начала'
                          : `С ${longDate(p.validFrom)}`}
                        {isCurrent && <span className="tag">сейчас</span>}
                      </div>
                      <div className="person__meta">
                        <span>амортизация {zlRate(p.amortPerKm)}/км</span>
                        <span>
                          {dec(p.fuelPer100)} {fuel.unit}/100 км × {zlRate(p.fuelPrice)}
                        </span>
                      </div>
                      {(p.basis || p.createdBy) && (
                        <div className="person__meta">
                          {p.basis && (
                            <span>
                              {zl(basisSum)} в год ÷ {num(p.basis.kmPerYear)} км
                            </span>
                          )}
                          {p.createdBy && <span>задал(а) {p.createdBy}</span>}
                        </div>
                      )}
                    </div>
                    {isAdmin && m.periods.length > 1 && (
                      <AlertDialog.Root>
                        <AlertDialog.Trigger>
                          <button type="button" className="inline-link danger-link">
                            Удалить
                          </button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content maxWidth="420px">
                          <AlertDialog.Title>Удалить ставки?</AlertDialog.Title>
                          <AlertDialog.Description size="3">
                            Поездки этого периода пересчитаются по предыдущим ставкам.
                          </AlertDialog.Description>
                          <Flex gap="3" mt="5" justify="end">
                            <AlertDialog.Cancel>
                              <Button variant="soft" color="gray" size="3">
                                Оставить
                              </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action>
                              <Button color="red" size="3" onClick={() => remove(p)}>
                                Удалить
                              </Button>
                            </AlertDialog.Action>
                          </Flex>
                        </AlertDialog.Content>
                      </AlertDialog.Root>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="field__hint">
            Новые ставки действуют с выбранной даты: прошлые поездки считаются по своим.
          </p>
          {error && (
            <div className="notice notice--error" role="alert" style={{ marginTop: 12 }}>
              <Pictogram name="warning" size={32} />
              <span>{error}</span>
            </div>
          )}
        </>
      )}

      {m.settings.fuelMode === 'refuels' && !editing && (
        <div className="tanks">
          <h3 className="tanks__title">Полные баки {m.year}</h3>
          {m.intervals.length ? (
            <ul className="people">
              {m.intervals.map((i) => (
                <li key={`${i.fromOdo}-${i.toOdo}`} className="person">
                  <div className="money-row">
                    <div>
                      <div className="person__name">
                        {num(i.fromOdo)} → {num(i.toOdo)} км
                      </div>
                      <div className="person__meta">
                        <span>
                          {shortDate(i.fromDate)} – {shortDate(i.toDate)}
                        </span>
                        <span>
                          {dec(i.units)} {fuel.unit} на {zl(i.amount)}
                        </span>
                        <span>
                          {dec(i.per100)} {fuel.unit}/100 км
                        </span>
                      </div>
                    </div>
                    <div className="money-row__sum">
                      <b>{zlRate(i.perKm)}</b>
                      <small>за км</small>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="prose">
              Пока ни одного: нужны две заправки «до полного» с показанием одометра. До тех пор
              топливо — по ставке выше.
            </p>
          )}
          <p className="field__hint">
            Всё, что залили между двумя полными баками, сожжено на этих км — так получается честная
            цена километра. Поездка считается по баку, в который попала.
          </p>
        </div>
      )}
    </section>
  );
}
