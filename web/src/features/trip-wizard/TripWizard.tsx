// Запись поездки по шагам: кто ехал → когда → сколько проехали → проверка с деньгами.
// Один вопрос на экран, «Далее» у большого пальца. Правка готовой поездки открывается сразу на проверке.
import { AlertDialog, Button, Flex, SegmentedControl, Switch, TextField } from '@radix-ui/themes';
import type { Journal, Member, Rider, Trip, TripInput } from '@shared/api/types';
import { intervalFor, periodFor, previewCost, tripRates } from '@shared/lib/cost';
import { dateRange, guestsLabel, longDate, num, today, zl } from '@shared/lib/format';
import { CostExplainer } from '@shared/ui/CostExplainer';
import { Glyph, Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { DateQuick, Stepper, StepQuestion, WizardProgress } from '@shared/ui/Wizard';
import { type FormEvent, useId, useMemo, useState } from 'react';

type Mode = 'odo' | 'km';
type Step = 0 | 1 | 2 | 3;
const STEPS = ['Кто', 'Когда', 'Пробег', 'Проверка'];

const toInt = (s: string) => {
  const v = Number(s.replace(/\s/g, ''));
  return s.trim() !== '' && Number.isFinite(v) ? Math.round(v) : null;
};
const toMoney = (s: string) => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};

/** Пропущенные км из разрыва одометра: мастер открывается с этими показаниями. */
export interface TripPrefill {
  date?: string;
  odoStart?: number;
  odoEnd?: number;
}

export function TripWizard({
  trip,
  step,
  setStep,
  last,
  costs,
  prefill,
  members,
  meId,
  busy,
  error,
  onSubmit,
  onDelete,
}: {
  trip?: Trip;
  step: Step;
  setStep: (s: Step) => void;
  last: Journal['lastOdometer'];
  /** от чего зависят деньги: периоды ставок, режим и тип топлива, полные баки */
  costs: Pick<Journal, 'periods' | 'settings' | 'intervals'>;
  prefill?: TripPrefill;
  members: Member[];
  meId: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: TripInput) => void;
  onDelete?: () => void;
}) {
  const ids = {
    start: useId(),
    finish: useId(),
    km: useId(),
    note: useId(),
    end: useId(),
    exAmount: useId(),
    exNote: useId(),
  };
  const isNew = !trip;
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const choices = useMemo(() => {
    const inTrip = new Set(trip?.riders.map((r) => r.memberId));
    const list = members.filter((m) => m.active || inTrip.has(m.id));
    return [...list].sort((a, b) => Number(b.id === meId) - Number(a.id === meId));
  }, [members, meId, trip]);

  const [shared, setShared] = useState(trip?.shared ?? false);
  const [riders, setRiders] = useState<Rider[]>(
    // пропущенные км: кто ездил — неизвестно, не подставляем себя
    trip ? trip.riders : meId && !prefill ? [{ memberId: meId, guests: 0 }] : [],
  );
  const [date, setDate] = useState(trip?.date ?? prefill?.date ?? today());
  const [multiDay, setMultiDay] = useState(!!trip?.endDate);
  const [endDate, setEndDate] = useState(trip?.endDate ?? '');
  const [mode, setMode] = useState<Mode>(trip && trip.odoStart === null ? 'km' : 'odo');
  const [start, setStart] = useState(
    trip?.odoStart != null
      ? String(trip.odoStart)
      : prefill?.odoStart != null
        ? String(prefill.odoStart)
        : isNew && last
          ? String(last.km)
          : '',
  );
  const [finish, setFinish] = useState(
    trip?.odoEnd != null
      ? String(trip.odoEnd)
      : prefill?.odoEnd != null
        ? String(prefill.odoEnd)
        : '',
  );
  const [kmText, setKmText] = useState(trip && trip.odoStart === null ? String(trip.km) : '');
  const [note, setNote] = useState(trip?.note ?? '');
  // расходы в дороге: платные дороги, парковки, паром — делятся вместе с поездкой
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [exAmount, setExAmount] = useState(trip?.extras ? String(trip.extras.amount) : '');
  const [exPaidBy, setExPaidBy] = useState<string | null>(
    trip?.extras ? trip.extras.paidBy : (meId ?? null),
  );
  const [exNote, setExNote] = useState(trip?.extras?.note ?? '');

  const toggleRider = (id: string) =>
    setRiders((rs) =>
      rs.some((r) => r.memberId === id)
        ? rs.filter((r) => r.memberId !== id)
        : [...rs, { memberId: id, guests: 0 }],
    );
  const setGuests = (id: string, guests: number) =>
    setRiders((rs) =>
      rs.map((r) => (r.memberId === id ? { ...r, guests, absent: guests > 0 && r.absent } : r)),
    );
  // «Ехали все»: одним касанием отметить всех, потом снять тех, кто не ехал
  const allIn = choices.length > 0 && choices.every((m) => riders.some((r) => r.memberId === m.id));
  const toggleAll = () =>
    setRiders((rs) =>
      allIn
        ? []
        : choices.map((m) => rs.find((r) => r.memberId === m.id) ?? { memberId: m.id, guests: 0 }),
    );
  const setAbsent = (id: string, absent: boolean) =>
    setRiders((rs) => rs.map((r) => (r.memberId === id ? { ...r, absent } : r)));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Участник';

  const s = toInt(start);
  const f = toInt(finish);
  const km = mode === 'odo' ? (s !== null && f !== null ? f - s : null) : toInt(kmText);
  const odoBad = mode === 'odo' && s !== null && f !== null && f <= s;
  // пропущенные км записываем задним числом — сравнивать с последней записью незачем
  const gap = isNew && !prefill && mode === 'odo' && last && s !== null ? s - last.km : 0;

  const place = { date, odoStart: mode === 'odo' ? s : null, odoEnd: mode === 'odo' ? f : null };
  const rates = tripRates(place, costs.periods, costs.settings, costs.intervals);
  const period = periodFor(costs.periods, date);
  const interval = rates.source === 'period' ? undefined : intervalFor(place, costs.intervals);
  const exValue = toMoney(exAmount);
  const exBad = exAmount.trim() !== '' && (exValue === null || exValue <= 0 || exValue > 100_000);
  // кто платил: участник поездки (в общей — любой) или вскладчину/касса
  const payers = shared ? choices : choices.filter((m) => riders.some((r) => r.memberId === m.id));
  const payer = exPaidBy && payers.some((m) => m.id === exPaidBy) ? exPaidBy : null;
  const extras = exValue && exValue > 0 && !exBad ? exValue : 0;
  const cost = previewCost(km && km > 0 ? km : 0, shared, riders, rates, extras);

  const valid: Record<Step, boolean> = {
    0: shared || (riders.length > 0 && riders.some((r) => !r.absent || r.guests > 0)),
    1: !!date && (!multiDay || !endDate || endDate >= date),
    2: km !== null && km > 0 && !odoBad,
    3: !exBad,
  };

  const whoLabel = shared
    ? 'По делам буса'
    : riders
        .map((r) =>
          r.absent
            ? `${guestsLabel(r.guests)}, позвал(а) ${nameOf(r.memberId)}`
            : `${nameOf(r.memberId)}${r.guests ? ` + ${guestsLabel(r.guests)}` : ''}`,
        )
        .join(', ');
  const payerLabel = payer ? nameOf(payer) : shared ? 'из кассы' : 'вскладчину';

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!valid[step]) return;
    // правка готовой поездки: поправили шаг — сразу обратно к проверке
    if (step < 3) return setStep(isNew ? ((step + 1) as Step) : 3);
    onSubmit({
      date,
      endDate: multiDay && endDate ? endDate : null,
      shared,
      riders: riders.map((r) => (shared ? { ...r, guests: 0, absent: false } : r)),
      odoStart: mode === 'odo' ? s : null,
      odoEnd: mode === 'odo' ? f : null,
      km: mode === 'km' ? km : null,
      note: note.trim(),
      extras: extras ? { amount: extras, paidBy: payer, note: exNote.trim() } : null,
    });
  };

  return (
    <form className="wizard" onSubmit={next} noValidate>
      <WizardProgress steps={STEPS} current={step} />

      <div className="wizard__step" key={step}>
        {step === 0 && (
          <>
            <StepQuestion
              hint={
                prefill?.odoStart != null && prefill.odoEnd != null
                  ? `Никто не записал ${num(prefill.odoEnd - prefill.odoStart)} км: ${num(prefill.odoStart)} → ${num(prefill.odoEnd)}. Если помните, кто ездил, — отметьте; если это перегон или ТО — «По делам буса».`
                  : shared
                    ? 'Стоимость — из общей кассы. Можно отметить, кто ездил.'
                    : 'Отметьте всех владельцев в машине. Гостей добавьте тому, кто их позвал.'
              }
            >
              Кто ехал?
            </StepQuestion>
            <div className="who-all">
              <span>
                {riders.length
                  ? `Отмечено ${riders.length} из ${choices.length}`
                  : 'Никто не отмечен'}
              </span>
              <button type="button" className="text-button" onClick={toggleAll}>
                {allIn ? 'Снять всех' : 'Ехали все'}
              </button>
            </div>
            <div className="who" role="group" aria-label="Владельцы в поездке">
              {choices.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={riders.some((r) => r.memberId === m.id)}
                  className="who__option"
                  onClick={() => toggleRider(m.id)}
                >
                  <span>
                    {m.name}
                    {m.id === meId ? ' (вы)' : ''}
                  </span>
                </button>
              ))}
            </div>
            {!shared && riders.length > 0 && (
              <ul className="guests-list" aria-label="Гости">
                {riders.map((r) => (
                  <li key={r.memberId}>
                    <span>
                      <b>{byId.get(r.memberId)?.name}</b>
                      <small>
                        {!r.guests
                          ? 'без гостей'
                          : r.absent
                            ? `отдал(а) бус: ${guestsLabel(r.guests)}`
                            : `позвал(а) ${guestsLabel(r.guests)}`}
                      </small>
                      {r.guests > 0 && (
                        <button
                          type="button"
                          className="absent-toggle"
                          aria-pressed={!!r.absent}
                          onClick={() => setAbsent(r.memberId, !r.absent)}
                        >
                          <span className="absent-toggle__box" aria-hidden>
                            {r.absent && <Glyph name="check" size={14} />}
                          </span>
                          Сам(а) не ехал(а)
                        </button>
                      )}
                    </span>
                    <Stepper
                      value={r.guests}
                      onChange={(g) => setGuests(r.memberId, g)}
                      label={`Гости ${byId.get(r.memberId)?.name ?? ''}`}
                    />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              aria-pressed={shared}
              className="who__option who__option--shared"
              style={{ marginTop: 16 }}
              onClick={() => setShared((v) => !v)}
            >
              <Pictogram name="wrench" size={28} />
              <span>По делам буса — ТО, мойка, перегон</span>
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <StepQuestion>Когда?</StepQuestion>
            <DateQuick value={date} onChange={setDate} label="Дата выезда" />
            <label className="switch-row" style={{ marginTop: 12 }}>
              <span>
                Несколько дней
                <small>Каждый день поездки — день пользования</small>
              </span>
              <Switch
                size="3"
                color="gray"
                highContrast
                aria-label="Несколько дней"
                checked={multiDay}
                onCheckedChange={setMultiDay}
              />
            </label>
            {multiDay && (
              <div style={{ marginTop: 8 }}>
                <label className="field__label" htmlFor={ids.end}>
                  Вернулись
                </label>
                <TextField.Root
                  id={ids.end}
                  className="date-input"
                  type="date"
                  size="3"
                  value={endDate}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <StepQuestion>Сколько проехали?</StepQuestion>
            <SegmentedControl.Root
              size="3"
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              style={{ width: '100%' }}
            >
              <SegmentedControl.Item value="odo">По одометру</SegmentedControl.Item>
              <SegmentedControl.Item value="km">Километрами</SegmentedControl.Item>
            </SegmentedControl.Root>
            {mode === 'odo' ? (
              <div style={{ marginTop: 16 }}>
                <div className="odo-pair">
                  <div>
                    <label htmlFor={ids.start}>До</label>
                    <input
                      id={ids.start}
                      className="num-input"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="181 232"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor={ids.finish}>После</label>
                    <input
                      id={ids.finish}
                      className="num-input"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={s !== null ? String(s + 100) : '181 500'}
                      value={finish}
                      aria-invalid={odoBad || undefined}
                      autoFocus={isNew && !!last}
                      onChange={(e) => setFinish(e.target.value)}
                    />
                  </div>
                </div>
                {isNew && !prefill && last && (
                  <p className="field__hint">
                    Последняя запись: {num(last.km)} км, {longDate(last.date)}.
                    {s !== last.km && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="inline-link"
                          onClick={() => setStart(String(last.km))}
                        >
                          Подставить
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <label htmlFor={ids.km} className="visually-hidden">
                  Километры
                </label>
                <input
                  id={ids.km}
                  className="num-input"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Сколько км"
                  value={kmText}
                  onChange={(e) => setKmText(e.target.value)}
                />
                <p className="field__hint">
                  Если показаний нет. По одометру точнее: видно, если кто-то забыл записать поездку.
                </p>
              </div>
            )}
            <div className="readout" aria-live="polite">
              <Pictogram name="gauge" size={48} />
              {km !== null && km > 0 && !odoBad ? (
                <span className="readout__value">
                  {num(km)}
                  <small>км</small>
                </span>
              ) : (
                <span className="readout__empty">
                  {odoBad ? 'Одометр после должен быть больше, чем до' : 'Пробег посчитается здесь'}
                </span>
              )}
            </div>
            {gap > 0 && (
              <div className="notice" role="note" style={{ marginTop: 12 }}>
                <Pictogram name="warning" size={32} />
                <span>
                  <b>{num(gap)} км с последней записи никто не записал.</b> Если ездили вы —
                  добавьте их отдельной поездкой.
                </span>
              </div>
            )}
            {gap < 0 && (
              <div className="notice" role="note" style={{ marginTop: 12 }}>
                <Pictogram name="warning" size={32} />
                <span>
                  <b>Начало на {num(-gap)} км раньше последней записи.</b> Проверьте показания —
                  похоже, этот отрезок уже записан.
                </span>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <StepQuestion>{isNew ? 'Проверим и запишем' : 'Поездка'}</StepQuestion>
            <dl className="review">
              <div>
                <dt>Кто ехал</dt>
                <dd>{whoLabel || '—'}</dd>
                <button type="button" className="inline-link" onClick={() => setStep(0)}>
                  Изменить
                </button>
              </div>
              <div>
                <dt>Когда</dt>
                <dd>{multiDay && endDate ? dateRange(date, endDate) : longDate(date)}</dd>
                <button type="button" className="inline-link" onClick={() => setStep(1)}>
                  Изменить
                </button>
              </div>
              <div>
                <dt>Пробег</dt>
                <dd>
                  {km ? `${num(km)} км` : '—'}
                  {mode === 'odo' && s !== null && f !== null ? ` · ${num(s)} → ${num(f)}` : ''}
                </dd>
                <button type="button" className="inline-link" onClick={() => setStep(2)}>
                  Изменить
                </button>
              </div>
              <div>
                <dt>Расходы в дороге</dt>
                <dd>
                  {extras
                    ? `${zl(extras)} · ${exNote.trim() ? `${exNote.trim()} · ` : ''}${payerLabel}`
                    : 'нет'}
                </dd>
                <button
                  type="button"
                  className="inline-link"
                  aria-expanded={extrasOpen}
                  onClick={() => setExtrasOpen((v) => !v)}
                >
                  {extrasOpen ? 'Готово' : extras ? 'Изменить' : 'Добавить'}
                </button>
              </div>
            </dl>

            {extrasOpen && (
              <div className="extras-editor">
                <div className="odo-pair">
                  <div>
                    <label htmlFor={ids.exAmount}>Сколько, zł</label>
                    <input
                      id={ids.exAmount}
                      className="num-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="40"
                      value={exAmount}
                      aria-invalid={exBad || undefined}
                      autoFocus
                      onChange={(e) => setExAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor={ids.exNote}>За что</label>
                    <TextField.Root
                      id={ids.exNote}
                      className="text-input"
                      size="3"
                      maxLength={120}
                      placeholder="A2, парковка"
                      value={exNote}
                      onChange={(e) => setExNote(e.target.value)}
                    />
                  </div>
                </div>
                {exBad && (
                  <p className="field__hint field__hint--error">Сумма — число больше нуля</p>
                )}
                <span className="field__label" style={{ margin: '14px 0 8px' }}>
                  Кто платил
                </span>
                <div className="who who--two" role="group" aria-label="Кто платил">
                  {payers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="who__option"
                      aria-pressed={payer === m.id}
                      onClick={() => setExPaidBy(m.id)}
                    >
                      <span>{m.name}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="who__option"
                    aria-pressed={payer === null}
                    onClick={() => setExPaidBy(null)}
                  >
                    <span>{shared ? 'Из кассы' : 'Вскладчину'}</span>
                  </button>
                </div>
                <p className="field__hint">
                  Платные дороги, парковки, паром — делятся вместе с поездкой.{' '}
                  {shared
                    ? ''
                    : payer
                      ? 'Кто платил — тому отдают остальные доли.'
                      : 'Вскладчину — каждый уже заплатил свою долю на месте.'}
                </p>
              </div>
            )}

            <section className="cost-sign" aria-label="Стоимость поездки">
              <div className="cost-sign__head">
                <span>Стоимость поездки</span>
                <b>{zl(cost.total)}</b>
              </div>
              <p className="cost-sign__split">
                амортизация {zl(cost.amort)} + топливо {zl(cost.fuel)}
                {cost.extras ? ` + в дороге ${zl(cost.extras)}` : ''}
              </p>
              {shared ? (
                <p className="cost-sign__note">Поездка по делам буса — платит общая касса.</p>
              ) : (
                <>
                  <ul className="cost-sign__riders">
                    {cost.riders.map((r) => (
                      <li key={r.memberId}>
                        <span>
                          {r.absent
                            ? `${guestsLabel(r.guests)}, позвал(а) ${nameOf(r.memberId)}`
                            : `${nameOf(r.memberId)}${r.guests ? ` и ${guestsLabel(r.guests)}` : ''}`}
                        </span>
                        <b>{zl(r.total)}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="cost-sign__note">
                    {cost.heads > 1 ? `По ${zl(cost.perHead)} с человека. ` : ''}
                    {costs.settings.fuelMode === 'rate'
                      ? `Бак на бак: топливо ${zl(cost.fuel)} делите на месте${cost.heads > 1 ? ` — по ${zl(cost.fuel / cost.heads)}` : ''}; амортизация идёт в кассу.`
                      : 'Всё учтётся в «Деньгах»: кто заправлял или платил в дороге — тому вернут.'}
                  </p>
                </>
              )}
              <CostExplainer
                km={km && km > 0 ? km : 0}
                cost={cost}
                rates={rates}
                period={period}
                interval={interval}
                settings={costs.settings}
                shared={shared}
                extras={extras ? { paidBy: payer, note: exNote.trim() } : null}
                nameOf={nameOf}
              />
            </section>

            <div style={{ marginTop: 24 }}>
              <label className="field__label" htmlFor={ids.note}>
                Куда ездили <span className="optional">— необязательно</span>
              </label>
              <TextField.Root
                id={ids.note}
                className="text-input"
                size="3"
                maxLength={300}
                placeholder="Варшава → Казимеж-Дольны"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {trip && (
              <Flex justify="between" align="center" gap="3" wrap="wrap" mt="5">
                <span className="form__meta">
                  {trip.createdBy ? `Записал(а) ${trip.createdBy}` : 'Запись'}
                  {trip.updatedBy && trip.updatedBy !== trip.createdBy
                    ? `, правил(а) ${trip.updatedBy}`
                    : ''}
                </span>
                {onDelete && (
                  <AlertDialog.Root>
                    <AlertDialog.Trigger>
                      <button type="button" className="inline-link danger-link">
                        Удалить поездку
                      </button>
                    </AlertDialog.Trigger>
                    <AlertDialog.Content maxWidth="420px">
                      <AlertDialog.Title>Удалить поездку?</AlertDialog.Title>
                      <AlertDialog.Description size="3">
                        {num(trip.km)} км, {longDate(trip.date)}. Запись пропадёт из журнала у всех
                        участников.
                      </AlertDialog.Description>
                      <Flex gap="3" mt="5" justify="end">
                        <AlertDialog.Cancel>
                          <Button variant="soft" color="gray" size="3">
                            Оставить
                          </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                          <Button color="red" size="3" onClick={onDelete}>
                            Удалить
                          </Button>
                        </AlertDialog.Action>
                      </Flex>
                    </AlertDialog.Content>
                  </AlertDialog.Root>
                )}
              </Flex>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <Pictogram name="warning" size={32} />
          <span>{error}</span>
        </div>
      )}

      <div className="form__submit">
        <SignButton type="submit" loading={busy} disabled={!valid[step]}>
          {step < 3 ? (isNew ? 'Далее' : 'Готово') : isNew ? 'Записать поездку' : 'Сохранить'}
        </SignButton>
      </div>
    </form>
  );
}
