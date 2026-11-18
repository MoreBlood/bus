// Общие детали пошаговых мастеров: прогресс, счётчик, быстрый выбор даты.
import { TextField } from '@radix-ui/themes';
import { addDays, longDate, today } from '@shared/lib/format';
import { type ReactNode, useId } from 'react';
import { Glyph } from './Pictogram';

export function WizardProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="wizard-progress" aria-label={`Шаг ${current + 1} из ${steps.length}`}>
      {steps.map((s, i) => (
        <li
          key={s}
          className={i < current ? 'is-done' : i === current ? 'is-current' : undefined}
          aria-current={i === current ? 'step' : undefined}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}

/** Вопрос шага — крупно, как сообщение на указателе. */
export function StepQuestion({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <header className="step-q">
      <h1 className="step-q__title">{children}</h1>
      {hint && <p className="step-q__hint">{hint}</p>}
    </header>
  );
}

export function Stepper({
  value,
  onChange,
  max = 30,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  label: string;
}) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Меньше"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Glyph name="minus" size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label="Больше"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Glyph name="plus" size={18} />
      </button>
    </span>
  );
}

/** Сегодня / вчера / позавчера одним касанием, остальное — календарём. */
export function DateQuick({
  value,
  onChange,
  label = 'Дата',
}: {
  value: string;
  onChange: (d: string) => void;
  label?: string;
}) {
  const id = useId();
  const t = today();
  const quick = [
    { d: t, label: 'Сегодня' },
    { d: addDays(t, -1), label: 'Вчера' },
    { d: addDays(t, -2), label: 'Позавчера' },
  ];
  const isQuick = quick.some((q) => q.d === value);
  return (
    <div>
      <div className="choice-row" role="radiogroup" aria-label={label}>
        {quick.map((q) => (
          <button
            key={q.d}
            type="button"
            role="radio"
            aria-checked={value === q.d}
            className="who__option"
            onClick={() => onChange(q.d)}
          >
            <span>{q.label}</span>
          </button>
        ))}
      </div>
      <label className="field__label" htmlFor={id} style={{ marginTop: 16 }}>
        {isQuick ? 'Или другой день' : 'Другой день'}
      </label>
      <TextField.Root
        id={id}
        className="date-input"
        type="date"
        size="3"
        value={value}
        max={t}
        onChange={(e) => onChange(e.target.value)}
      />
      {!isQuick && value && <p className="field__hint">{longDate(value)}</p>}
    </div>
  );
}
