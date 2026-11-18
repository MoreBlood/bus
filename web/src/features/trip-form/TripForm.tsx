// Форма поездки. Сигнатура: «одометр до» подставлен из последней записи, пробег считается вживую,
// разрыв или пересечение с прошлой поездкой видны до сохранения.
import { AlertDialog, Button, Flex, SegmentedControl, Switch, TextField } from '@radix-ui/themes';
import type { Journal, Member, Trip, TripInput } from '@shared/api/types';
import { longDate, num, today } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { type FormEvent, useId, useMemo, useState } from 'react';

type Mode = 'odo' | 'km';

const toInt = (s: string) => {
  const v = Number(s.replace(/\s/g, ''));
  return s.trim() !== '' && Number.isFinite(v) ? Math.round(v) : null;
};

export function TripForm({
  trip,
  last,
  members,
  meId,
  busy,
  error,
  onSubmit,
  onDelete,
}: {
  /** правка существующей поездки; без неё — новая */
  trip?: Trip;
  last: Journal['lastOdometer'];
  members: Member[];
  meId: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: TripInput) => void;
  onDelete?: () => void;
}) {
  const ids = {
    date: useId(),
    end: useId(),
    start: useId(),
    finish: useId(),
    km: useId(),
    note: useId(),
  };
  const isNew = !trip;
  const choices = useMemo(() => {
    const active = members.filter((m) => m.active || m.id === trip?.memberId);
    // «вы» — первым: чаще всего записывают свою поездку
    return [...active].sort((a, b) => Number(b.id === meId) - Number(a.id === meId));
  }, [members, meId, trip?.memberId]);

  const [who, setWho] = useState<string | null>(
    trip ? trip.memberId : (meId ?? choices[0]?.id ?? null),
  );
  const [date, setDate] = useState(trip?.date ?? today());
  const [multiDay, setMultiDay] = useState(!!trip?.endDate);
  const [endDate, setEndDate] = useState(trip?.endDate ?? '');
  const [mode, setMode] = useState<Mode>(trip && trip.odoStart === null ? 'km' : 'odo');
  const [start, setStart] = useState(
    trip?.odoStart != null ? String(trip.odoStart) : isNew && last ? String(last.km) : '',
  );
  const [finish, setFinish] = useState(trip?.odoEnd != null ? String(trip.odoEnd) : '');
  const [kmText, setKmText] = useState(trip && trip.odoStart === null ? String(trip.km) : '');
  const [note, setNote] = useState(trip?.note ?? '');
  const [touched, setTouched] = useState(false);

  const s = toInt(start);
  const f = toInt(finish);
  const distance = mode === 'odo' ? (s !== null && f !== null ? f - s : null) : toInt(kmText);
  const odoBad = mode === 'odo' && s !== null && f !== null && f <= s;
  // сравнение с последней записью — только для новой поездки (у правки «последней» может быть она сама)
  const gap = isNew && mode === 'odo' && last && s !== null ? s - last.km : 0;

  const problem =
    who === undefined
      ? 'Выберите, кто ехал'
      : !date
        ? 'Укажите дату'
        : multiDay && endDate && endDate < date
          ? 'Возвращение раньше выезда'
          : mode === 'odo'
            ? s === null || f === null
              ? 'Нужны оба показания одометра'
              : odoBad
                ? 'Одометр после должен быть больше, чем до'
                : null
            : distance === null || distance <= 0
              ? 'Укажите пробег больше нуля'
              : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onSubmit({
      date,
      endDate: multiDay && endDate ? endDate : null,
      memberId: who,
      odoStart: mode === 'odo' ? s : null,
      odoEnd: mode === 'odo' ? f : null,
      km: mode === 'km' ? distance : null,
      note: note.trim(),
    });
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Кто ехал</legend>
        <div className="who" role="radiogroup" aria-label="Кто ехал">
          {choices.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={who === m.id}
              className="who__option"
              onClick={() => setWho(m.id)}
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
            aria-checked={who === null}
            className="who__option who__option--shared"
            onClick={() => setWho(null)}
          >
            <Pictogram name="people" size={28} />
            <span>Общая поездка — по делам буса</span>
          </button>
        </div>
        <p className="field__hint">
          Личные км записывайте на того, кто брал бус для себя. Каждый отрезок — один раз.
        </p>
      </fieldset>

      <div>
        <label className="field__label" htmlFor={ids.date}>
          {multiDay ? 'Выезд' : 'Дата'}
        </label>
        <TextField.Root
          id={ids.date}
          className="date-input"
          type="date"
          size="3"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
        />
        <label className="switch-row" style={{ marginTop: 8 }}>
          <span>Несколько дней</span>
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
              Возвращение
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
            <p className="field__hint">Каждый день поездки считается днём пользования.</p>
          </div>
        )}
      </div>

      <div>
        <span className="field__label">Пробег</span>
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
            {isNew && last && (
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
              Если показаний одометра нет. По одометру точнее: видно, если кто-то забыл записать
              поездку.
            </p>
          </div>
        )}

        <div className="readout" aria-live="polite">
          <Pictogram name="gauge" size={48} />
          {distance !== null && distance > 0 && !odoBad ? (
            <span className="readout__value">
              {num(distance)}
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
              <b>{num(gap)} км с последней записи никто не записал.</b> Если ездили вы — добавьте их
              отдельной поездкой; иначе разрыв будет виден в журнале.
            </span>
          </div>
        )}
        {gap < 0 && (
          <div className="notice" role="note" style={{ marginTop: 12 }}>
            <Pictogram name="warning" size={32} />
            <span>
              <b>Начало на {num(-gap)} км раньше последней записи.</b> Проверьте показания — похоже,
              этот отрезок уже записан.
            </span>
          </div>
        )}
      </div>

      <div>
        <label className="field__label" htmlFor={ids.note}>
          Маршрут или цель
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

      {(error || (touched && problem)) && (
        <div className="notice notice--error" role="alert">
          <Pictogram name="warning" size={32} />
          <span>{error ?? problem}</span>
        </div>
      )}

      <div className="form__actions">
        {trip && (
          <Flex justify="between" align="center" gap="3" wrap="wrap">
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
      </div>

      <div className="form__submit">
        <SignButton type="submit" loading={busy}>
          {isNew ? 'Записать поездку' : 'Сохранить'}
        </SignButton>
      </div>
    </form>
  );
}
