// Ремонт и ТО по шагам: что сделали → сколько, кто заплатил и за чей счёт.
// Обычно ремонт несёт касса: он гасится из резерва — износа, который каждый начислил своими км.
import { AlertDialog, Button, Flex, Switch, TextField } from '@radix-ui/themes';
import type { Member, Repair, RepairInput, RepairKind } from '@shared/api/types';
import { longDate, num, today, zl } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { DateQuick, StepQuestion, WizardProgress } from '@shared/ui/Wizard';
import { type FormEvent, useId, useMemo, useState } from 'react';

const FUND = '__fund';
const toNum = (s: string) => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

export const REPAIR_KINDS: Record<RepairKind, { label: string; placeholder: string }> = {
  repair: { label: 'Ремонт', placeholder: 'Отвалился патрубок интеркулера' },
  service: { label: 'ТО', placeholder: 'Масло и фильтры' },
  tires: { label: 'Шины', placeholder: 'Зимняя резина, шиномонтаж' },
  other: { label: 'Прочее', placeholder: 'Химчистка салона' },
  upgrade: { label: 'Улучшение', placeholder: 'Бокс на крышу' },
};

export function RepairWizard({
  repair,
  step,
  setStep,
  lastOdometer,
  reserveLeft,
  members,
  meId,
  busy,
  error,
  onSubmit,
  onDelete,
}: {
  repair?: Repair;
  step: 0 | 1;
  setStep: (s: 0 | 1) => void;
  lastOdometer: number | null;
  /** сколько сейчас в резерве — для подсказки */
  reserveLeft: number | null;
  members: Member[];
  meId: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: RepairInput) => void;
  onDelete?: () => void;
}) {
  const ids = { title: useId(), amount: useId(), odo: useId(), note: useId() };
  const isNew = !repair;
  const choices = useMemo(
    () =>
      [
        ...members.filter((m) => m.active || m.id === repair?.paidBy || m.id === repair?.chargedTo),
      ].sort((a, b) => Number(b.id === meId) - Number(a.id === meId)),
    [members, meId, repair],
  );
  const [kind, setKind] = useState<RepairKind>(repair?.kind ?? 'repair');
  const [title, setTitle] = useState(repair?.title ?? '');
  const [date, setDate] = useState(repair?.date ?? today());
  const [odo, setOdo] = useState(
    repair?.odometer != null ? String(repair.odometer) : lastOdometer ? String(lastOdometer) : '',
  );
  const [amount, setAmount] = useState(repair ? String(repair.amount) : '');
  const [payer, setPayer] = useState<string>(repair ? (repair.paidBy ?? FUND) : (meId ?? FUND));
  const [fault, setFault] = useState(!!repair?.chargedTo);
  const [chargedTo, setChargedTo] = useState<string | null>(repair?.chargedTo ?? null);
  const [note, setNote] = useState(repair?.note ?? '');

  const a = toNum(amount);
  const o = toNum(odo);
  const valid =
    step === 0
      ? !!date && title.trim().length > 0
      : a !== null && a > 0 && !!payer && (!fault || !!chargedTo);

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (step === 0) return setStep(1);
    onSubmit({
      date,
      kind,
      title: title.trim(),
      amount: a ?? 0,
      paidBy: payer === FUND ? null : payer,
      chargedTo: fault ? chargedTo : null,
      odometer: o === null ? null : Math.round(o),
      note: note.trim(),
    });
  };

  const bearer = fault
    ? chargedTo
      ? `Вся сумма — на ${members.find((m) => m.id === chargedTo)?.name ?? 'участнике'}.`
      : 'Выберите, кто сломал.'
    : kind === 'upgrade'
      ? 'Улучшение — поровну на всех владельцев: это вложение в бус, а не износ.'
      : `Из резерва — по тому, кто сколько износил бус своими км${
          reserveLeft !== null ? ` (сейчас в резерве ${zl(reserveLeft)})` : ''
        }. Не хватит — остаток поровну на владельцев.`;

  return (
    <form className="wizard" onSubmit={next} noValidate>
      <WizardProgress steps={['Что сделали', 'Сколько']} current={step} />
      <div className="wizard__step" key={step}>
        {step === 0 ? (
          <>
            <StepQuestion hint="Ремонт, ТО, шины — всё, что тратили на бус.">
              Что сделали?
            </StepQuestion>
            <div className="who who--kinds" role="radiogroup" aria-label="Что это">
              {(Object.keys(REPAIR_KINDS) as RepairKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className="who__option"
                  onClick={() => setKind(k)}
                >
                  <span>{REPAIR_KINDS[k].label}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="field__label" htmlFor={ids.title}>
                Коротко
              </label>
              <TextField.Root
                id={ids.title}
                className="text-input"
                size="3"
                maxLength={120}
                placeholder={REPAIR_KINDS[kind].placeholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 20 }}>
              <span className="field__label">Когда</span>
              <DateQuick value={date} onChange={setDate} label="Дата ремонта" />
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
              <p className="field__hint">
                Пригодится потом: когда меняли масло, на каком пробеге отвалилась подвеска.
              </p>
            </div>
          </>
        ) : (
          <>
            <StepQuestion>Сколько и кто заплатил?</StepQuestion>
            <label className="visually-hidden" htmlFor={ids.amount}>
              Сумма, zł
            </label>
            <div className="readout readout--input">
              <Pictogram name="toolbox" size={48} />
              <input
                id={ids.amount}
                className="num-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Сумма, zł"
                value={amount}
                autoFocus
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <span className="field__label" style={{ marginTop: 20 }}>
              Кто заплатил в сервисе
            </span>
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
            <p className="field__hint">Кто платил своими — тому вернут доли остальных.</p>

            <label className="switch-row" style={{ marginTop: 16 }}>
              <span>
                Сломал(а) кто-то из нас
                <small>Тогда ремонт за его счёт, а не из резерва</small>
              </span>
              <Switch
                size="3"
                color="gray"
                highContrast
                aria-label="Сломал кто-то из нас"
                checked={fault}
                onCheckedChange={setFault}
              />
            </label>
            {fault && (
              <div className="who" role="radiogroup" aria-label="Кто сломал">
                {choices.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={chargedTo === m.id}
                    className="who__option"
                    onClick={() => setChargedTo(m.id)}
                  >
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="notice notice--plain" role="note" style={{ marginTop: 16 }}>
              <Pictogram name="toolbox" size={32} />
              <span>
                <b>За чей счёт.</b> {bearer}
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="field__label" htmlFor={ids.note}>
                Заметка <span className="optional">— необязательно</span>
              </label>
              <TextField.Root
                id={ids.note}
                className="text-input"
                size="3"
                maxLength={300}
                placeholder="СТО в Пясечно, гарантия 6 месяцев"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {repair && onDelete && (
              <Flex justify="between" align="center" gap="3" wrap="wrap" mt="5">
                <span className="form__meta">
                  {repair.createdBy ? `Записал(а) ${repair.createdBy}` : 'Запись'}
                  {repair.odometer ? ` · ${num(repair.odometer)} км` : ''}
                </span>
                <AlertDialog.Root>
                  <AlertDialog.Trigger>
                    <button type="button" className="inline-link danger-link">
                      Удалить запись
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="420px">
                    <AlertDialog.Title>Удалить запись о ремонте?</AlertDialog.Title>
                    <AlertDialog.Description size="3">
                      {repair.title}, {zl(repair.amount)}, {longDate(repair.date)}. Доли и резерв
                      пересчитаются у всех.
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
          {step === 0 ? 'Далее' : isNew ? 'Записать ремонт' : 'Сохранить'}
        </SignButton>
      </div>
    </form>
  );
}
