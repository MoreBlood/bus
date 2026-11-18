// Кнопка-указатель: жёлтая панель, текст слева, чёрный квадрат со стрелкой прибит к правому краю.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Glyph, type PictogramName } from './Pictogram';

type Common = {
  children: ReactNode;
  icon?: PictogramName;
  size?: 'md' | 'lg';
  tone?: 'yellow' | 'black';
  loading?: boolean;
};

const cls = ({ size = 'lg', tone = 'yellow', loading }: Omit<Common, 'children'>) =>
  `sign-button sign-button--${size} sign-button--${tone}${loading ? ' is-loading' : ''}`;

function Inner({ children, icon = 'arrow' }: Pick<Common, 'children' | 'icon'>) {
  return (
    <>
      <span className="sign-button__label">{children}</span>
      <span className="sign-button__arrow" aria-hidden>
        <Glyph name={icon} size={26} />
      </span>
    </>
  );
}

export function SignButton({
  children,
  icon,
  size,
  tone,
  loading,
  disabled,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cls({ size, tone, loading })}
    >
      <Inner icon={icon}>{children}</Inner>
    </button>
  );
}

export function SignLink({ children, icon, size, tone, ...rest }: Common & LinkProps) {
  return (
    <Link {...rest} className={cls({ size, tone })}>
      <Inner icon={icon}>{children}</Inner>
    </Link>
  );
}
