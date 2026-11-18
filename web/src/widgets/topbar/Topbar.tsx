// Липкая жёлтая полоса: знак-логотип, раздел, действия. На десктопе — навигация по разделам.
import { authClient } from '@shared/auth/client';
import { useSetup } from '@shared/model/setup';
import { Pictogram } from '@shared/ui/Pictogram';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { NAV } from '../../app/nav';

export function Topbar({
  section,
  compact = false,
  compactValue,
  back,
  children,
}: {
  section: string;
  /** табличка одометра ушла за край — показываем её значение в полосе */
  compact?: boolean;
  compactValue?: string;
  /** кнопка «назад» вместо логотипа */
  back?: string;
  children?: ReactNode;
}) {
  const setup = useSetup();
  const navigate = useNavigate();
  return (
    <header className={`topbar${compact || back ? ' is-compact' : ''}`}>
      <div className="topbar__inner">
        {back ? (
          <Link to={back} className="wordmark" aria-label="Назад">
            <Pictogram name="back" size={40} />
            <span className="wordmark__section">{section}</span>
          </Link>
        ) : (
          <Link to="/" className="wordmark" aria-label="Бус — на главную">
            <Pictogram name="van" size={40} />
            <span className="wordmark__name">Бус</span>
            <span className="wordmark__section wordmark__section--brand">{section}</span>
          </Link>
        )}
        <nav className="topbar__nav" aria-label="Разделы">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        {compactValue && (
          <span className="topbar__odo" aria-hidden={!compact}>
            {compactValue}
          </span>
        )}
        <div className="topbar__actions">
          {children}
          {setup?.auth && setup.login && (
            <button
              type="button"
              className="icon-button"
              title={`Выйти (${setup.login})`}
              aria-label={`Выйти (${setup.login})`}
              onClick={() => authClient.signOut().then(() => navigate('/sign-in'))}
            >
              <ExitGlyph />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ExitGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="square"
      aria-hidden
    >
      <path d="M10 4.5H4.5v15H10" />
      <path d="M9.5 12h11M16 7.5l4.5 4.5-4.5 4.5" />
    </svg>
  );
}
