// Пиктограммы в стиле указателей: белый знак на чёрном квадрате (или просто знак цветом текста).
// Знаки — Phosphor: предметы залитые (fill), как на табличках; простые метки (+, ✓, !) — жирные,
// в fill они превращаются в коробочки.
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  Copy,
  ExclamationMark,
  GasPump,
  Gauge,
  type Icon,
  type IconWeight,
  Key,
  Minus,
  Plus,
  Receipt,
  Toolbox,
  User,
  Users,
  Van,
  Wrench,
} from '@phosphor-icons/react';

const ICONS = {
  van: [Van, 'fill'],
  gauge: [Gauge, 'fill'],
  arrow: [ArrowRight, 'fill'],
  back: [ArrowLeft, 'fill'],
  warning: [ExclamationMark, 'bold'],
  person: [User, 'fill'],
  // общая поездка: двое
  people: [Users, 'fill'],
  plus: [Plus, 'bold'],
  minus: [Minus, 'bold'],
  // расходы в дороге: чек
  receipt: [Receipt, 'fill'],
  // ремонт и ТО
  toolbox: [Toolbox, 'fill'],
  // помощник ставки амортизации
  calculator: [Calculator, 'fill'],
  key: [Key, 'fill'],
  copy: [Copy, 'bold'],
  check: [Check, 'bold'],
  pump: [GasPump, 'fill'],
  // гаечный ключ: поездка по делам буса
  wrench: [Wrench, 'fill'],
} satisfies Record<string, [Icon, IconWeight]>;

export type PictogramName = keyof typeof ICONS;

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
  const [Component, weight] = ICONS[name];
  return (
    <Component
      size={size}
      weight={weight}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
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
      <Glyph name={name} size={Math.round(size * 0.64)} label={label} />
    </span>
  );
}
