// Заправка по шагам: кто заплатил и когда → сколько залили.
import { AlertDialog, Button, Flex, Switch, TextField } from '@radix-ui/themes';
import type { FuelType, Member, Refuel, RefuelInput } from '@shared/api/types';
import { FUEL_TYPES } from '@shared/lib/cost';
import { longDate, num, today, zlRate } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { DateQuick, StepQuestion, WizardProgress } from '@shared/ui/Wizard';
import { type FormEvent, useId, useMemo, useState } from 'react';

const FUND = '__fund';
const toNum = (s: string) => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

export function RefuelWizard({
  refuel,
  step,
  setStep,
  lastOdometer,
  fuelType,
  members,
  meId,
  busy,
  error,
  onSubmit,
  onDelete,
}: {
  refuel?: Refuel;
  step: 0 | 1;
  setStep: (s: 0 | 1) => void;
  lastOdometer: number | null;
  fuelType: FuelType;
  members: Member[];
  meId: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: RefuelInput) => void;
  onDelete?: () => void;
}) {
  const ids = { liters: useId(), amount: useId(), odo: useId(), note: useId() };
  const fuel = FUEL_TYPES[fuelType];
  const isNew = !refuel;
  const choices = useMemo(
    () =>
      [...members.filter((m) => m.active || m.id === refuel?.paidBy)].sort(
        (a, b) => Number(b.id === meId) - Number(a.id === meId),
      ),
    [members, meId, refuel],
  );
  const [payer, setPayer] = useState<string>(refuel ? (refuel.paidBy ?? FUND) : (meId ?? FUND));
  const [date, setDate] = useState(refuel?.date ?? today());
  const [liters, setLiters] = useState(refuel ? String(refuel.liters) : '');
  const [amount, setAmount] = useState(refuel ? String(refuel.amount) : '');
  const [odo, setOdo] = useState(
    refuel?.odometer != null ? String(refuel.odometer) : lastOdometer ? String(lastOdometer) : '',
  );
  const [full, setFull] = useState(refuel?.full ?? true);
  const [note, setNote] = useState(refuel?.note ?? '');

  const l = toNum(liters);
  const a = toNum(amount);
  const o = toNum(odo);
  const valid = step === 0 ? !!date && !!payer : l !== null && l > 0 && a !== null && a > 0;

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (step === 0) return setStep(1);
    onSubmit({
      date,
      paidBy: payer === FUND ? null : payer,
      liters: l ?? 0,
      amount: a ?? 0,
      odometer: o === null ? null : Math.round(o),
      full,
      note: note.trim(),
    });
  };

  return (
    <form className="wizard" onSubmit={next} noValidate>
      <WizardProgress steps={['Кто и когда', 'Сколько']} current={step} />
      <div className="wizard__step" key={step}>
        {step === 0 ? (
          <>
            <StepQuestion hint="Тот, кто платил на кассе, — ему вернут доли остальных.">
              Кто заплатил?
            </StepQuestion>
            <div className="who" role="radiogroup" aria-label="Кто заплатил">
              {choices.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={payer === m.id}
                  className="who__option"
                  onClick={() => setPayer(m.id)}
                >
                  <span>
                    {m.name}
                    {m.id === meId ? ' (вы)' : ''}
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={payer === FUND}
                className="who__option who__option--shared"
                onClick={() => setPayer(FUND)}
              >
                <Pictogram name="wrench" size={28} />
                <span>Из общей кассы</span>
              </button>
            </div>
            <div style={{ marginTop: 24 }}>
              <span className="field__label">Когда</span>
              <DateQuick value={date} onChange={setDate} label="Дата заправки" />
            </div>
          </>
        ) : (
          <>
            <StepQuestion>Сколько залили?</StepQuestion>
            <div className="odo-pair">
              <div>
                <label htmlFor={ids.liters}>{fuel.unit === 'л' ? 'Литры' : fuel.unit}</label>
                <input
                  id={ids.liters}
                  className="num-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="62"
                  value={liters}
                  autoFocus
                  onChange={(e) => setLiters(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={ids.amount}>Сумма, zł</label>
                <input
                  id={ids.amount}
                  className="num-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="403"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="readout" aria-live="polite">
              <Pictogram name="pump" size={48} />
              {l && a ? (
                <span className="readout__value">
                  {zlRate(a / l)}
                  <small>за {fuel.unitWord}</small>
                </span>
              ) : (
                <span className="readout__empty">Цена за {fuel.unitWord} посчитается здесь</span>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="field__label" htmlFor={ids.odo}>
                Одометр <span className="optional">— необязательно</span>
              </label>
              <input
                id={ids.odo}
                className="num-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="181 500"
                value={odo}
                onChange={(e) => setOdo(e.target.value)}
              />
              {lastOdometer && isNew && (
                <p className="field__hint">
                  Последняя поездка закончилась на {num(lastOdometer)} км.
                </p>
              )}
            </div>
            <label className="switch-row" style={{ marginTop: 12 }}>
              <span>
                До полного бака
                <small>Два полных бака с одометром — и видно честный расход и цену км</small>
              </span>
              <Switch
                size="3"
                color="gray"
                highContrast
                aria-label="До полного бака"
                checked={full}
                onCheckedChange={setFull}
              />
            </label>
            <div style={{ marginTop: 16 }}>
              <label className="field__label" htmlFor={ids.note}>
                Заметка <span className="optional">— необязательно</span>
              </label>
              <TextField.Root
                id={ids.note}
                className="text-input"
                size="3"
                maxLength={300}
                placeholder="Orlen, Пясечно"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {refuel && onDelete && (
              <Flex justify="between" align="center" gap="3" wrap="wrap" mt="5">
                <span className="form__meta">
                  {refuel.createdBy ? `Записал(а) ${refuel.createdBy}` : 'Запись'}
                </span>
                <AlertDialog.Root>
                  <AlertDialog.Trigger>
                    <button type="button" className="inline-link danger-link">
                      Удалить заправку
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="420px">
                    <AlertDialog.Title>Удалить заправку?</AlertDialog.Title>
                    <AlertDialog.Description size="3">
                      {refuel.liters} {fuel.unit}, {longDate(refuel.date)}. Расчёт топлива
                      пересчитается у всех.
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
        <SignButton type="submit" loading={busy} disabled={!valid}>
          {step === 0 ? 'Далее' : isNew ? 'Записать заправку' : 'Сохранить'}
        </SignButton>
      </div>
    </form>
  );
}
