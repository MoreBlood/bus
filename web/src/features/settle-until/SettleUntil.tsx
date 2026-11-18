// «Рассчитались до»: старая история (заполненная задним числом) остаётся в статистике и резерве,
// но не превращается в долги. Ставит админ.
import { TextField } from '@radix-ui/themes';
import { errorText, saveSettings } from '@shared/api/client';
import { longDate, today } from '@shared/lib/format';
import { type FormEvent, useId, useState } from 'react';

export function SettleUntil({
  settledUntil,
  isAdmin,
  onSaved,
}: {
  settledUntil: string | null;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(settledUntil ?? today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ settledUntil: value });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save(date);
  };

  if (open)
    return (
      <form className="settle" onSubmit={submit}>
        <label className="field__label" htmlFor={id}>
          Рассчитались до
        </label>
        <div className="settle__row">
          <TextField.Root
            id={id}
            className="date-input"
            type="date"
            size="3"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="submit" className="text-button" disabled={busy}>
            Сохранить
          </button>
        </div>
        <p className="field__hint">
          Всё по эту дату включительно уже рассчитано: поездки, заправки и ремонты остаются в
          статистике и резерве, но в долги не попадают.{' '}
          {settledUntil && (
            <button type="button" className="inline-link" onClick={() => save(null)}>
              Снять отметку
            </button>
          )}
        </p>
        {error && <p className="field__hint field__hint--error">{error}</p>}
      </form>
    );

  return (
    <p className="field__hint settle__note">
      {settledUntil
        ? `Всё по ${longDate(settledUntil)} рассчитано — старые записи в долги не попадают.`
        : 'Заполняете историю задним числом? Отметьте, до какой даты все уже рассчитались.'}{' '}
      {isAdmin && (
        <button type="button" className="inline-link" onClick={() => setOpen(true)}>
          {settledUntil ? 'Изменить' : 'Рассчитались до…'}
        </button>
      )}
    </p>
  );
}
