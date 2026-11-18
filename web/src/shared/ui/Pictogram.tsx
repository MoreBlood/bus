// Пиктограммы в стиле указателей: белый знак на чёрном квадрате (или просто знак цветом текста).
// Нарисованы вручную одним штрихом 2.5 на сетке 24×24.
import type { ReactNode } from 'react';

export type PictogramName =
  | 'van'
  | 'gauge'
  | 'arrow'
  | 'back'
  | 'warning'
  | 'person'
  | 'people'
  | 'plus'
  | 'key'
  | 'copy'
  | 'check'
  | 'pump'
  | 'wrench';

const PATHS: Record<PictogramName, ReactNode> = {
  // бус сбоку: кузов с покатым носом, окна, два колеса
  van: (
    <>
      <path d="M2.5 16.5V7.5a1.5 1.5 0 0 1 1.5-1.5h11.5l3.5 4 2.5 1v5.5H2.5Z" />
      <path d="M5.5 9.5h4v2.5h-4zM12.5 9.5h3.5l1.5 2.5h-5z" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  // одометр: дуга шкалы и стрелка
  gauge: (
    <>
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17l4.5-6" />
      <path d="M6 13.5l1.2.7M12 8.5v1.4M18 13.5l-1.2.7" />
    </>
  ),
  arrow: <path d="M3.5 12h16M13 5.5l6.5 6.5-6.5 6.5" />,
  back: <path d="M20.5 12h-16M11 5.5L4.5 12l6.5 6.5" />,
  warning: (
    <>
      <path d="M12 5v9" />
      <path d="M12 18.2v.3" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M5.5 20.5c.6-4.2 3.1-6.5 6.5-6.5s5.9 2.3 6.5 6.5" />
    </>
  ),
  // общая поездка: двое
  people: (
    <>
      <circle cx="8.5" cy="7.5" r="2.6" />
      <circle cx="16" cy="7.5" r="2.6" />
      <path d="M3 19.5c.5-3.6 2.6-5.5 5.5-5.5s5 1.9 5.5 5.5M13.6 14.4c.8-.3 1.6-.4 2.4-.4 2.9 0 5 1.9 5.5 5.5" />
    </>
  ),
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  copy: (
    <>
      <path d="M8.5 8.5h11v11h-11z" />
      <path d="M15.5 5V4.5h-11v11H5" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  // колонка заправки: корпус, окошко, шланг с пистолетом
  pump: (
    <>
      <path d="M4.5 20.5v-15a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v15M3 20.5h12" />
      <path d="M7 7.5h4v3.5H7zM13.5 9h2.5l2.5 2.5V17a1.5 1.5 0 0 0 3 0V8l-2.5-2.5" />
    </>
  ),
  // гаечный ключ: поездка по делам буса
  wrench: (
    <path d="M14.5 4a5 5 0 0 0-4.7 6.7L4 16.5 7.5 20l5.8-5.8A5 5 0 0 0 20 9.5l-3 3-3-.9-.9-3 3-3A5 5 0 0 0 14.5 4Z" />
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12h9M17.5 12v3M20.5 12v2.5" />
    </>
  ),
};

/** Знак без подложки: цвет — currentColor. */
export function Glyph({
  name,
  size = 24,
  label,
}: {
  name: PictogramName;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Знак на чёрном квадрате — как пиктограмма на указателе. */
export function Pictogram({
  name,
  size = 44,
  tone = 'black',
  label,
}: {
  name: PictogramName;
  size?: number;
  tone?: 'black' | 'yellow';
  label?: string;
}) {
  return (
    <span className={`pictogram pictogram--${tone}`} style={{ width: size, height: size }}>
      <Glyph name={name} size={Math.round(size * 0.62)} label={label} />
    </span>
  );
}
