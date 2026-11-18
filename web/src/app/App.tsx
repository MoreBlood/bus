import '@radix-ui/themes/styles.css';
import './app.css';
import { AssistantPage } from '@pages/assistant/AssistantPage';
import { ConsentPage } from '@pages/auth/ConsentPage';
import { SignInPage } from '@pages/auth/SignInPage';
import { JournalPage } from '@pages/journal/JournalPage';
import { MembersPage } from '@pages/members/MembersPage';
import { SetupPage } from '@pages/setup/SetupPage';
import { TripPage } from '@pages/trip/TripPage';
import { Theme } from '@radix-ui/themes';
import { SessionProvider, useSession } from '@shared/model/session';
import { SetupProvider, useSetupLoader } from '@shared/model/setup';
import { Glyph } from '@shared/ui/Pictogram';
import { SignButton, SignLink } from '@shared/ui/SignButton';
import { Topbar } from '@widgets/topbar/Topbar';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { NAV } from './nav';

/** Телефон: главное действие у большого пальца и разделы внизу. На десктопе скрыто стилями. */
function Dock() {
  const { pathname } = useLocation();
  return (
    <div className="dock">
      {pathname === '/' && (
        <div className="dock__cta">
          <SignLink to="/trips/new">Записать поездку</SignLink>
        </div>
      )}
      <nav className="tabbar" aria-label="Разделы">
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Glyph name={icon} size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { error } = useSession();
  const form = pathname.startsWith('/trips/');
  if (error)
    return (
      <div className="gate">
        <Topbar section="Бортжурнал" />
        <main className="gate__body" role="alert">
          <h1 className="gate__title">Журнал не открылся</h1>
          <p className="prose">Сервер ответил: {error}. Проверьте связь и попробуйте ещё раз.</p>
          <div style={{ marginTop: 20 }}>
            <SignButton onClick={() => window.location.reload()}>Обновить</SignButton>
          </div>
        </main>
      </div>
    );
  return (
    <>
      <main className={`app-main${pathname === '/' ? ' has-cta' : ''}`}>
        <Routes>
          <Route path="/" element={<JournalPage />} />
          <Route path="/trips/new" element={<TripPage />} />
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="*" element={<JournalPage />} />
        </Routes>
      </main>
      {!form && <Dock />}
    </>
  );
}

/** Облачная установка без настроенного входа — показываем страницу настройки. */
function Gate() {
  const setup = useSetupLoader();
  if (setup === undefined) return <div className="topbar" style={{ height: 64 }} aria-busy />;
  if (setup && !setup.authConfigured) return <SetupPage setup={setup} />;
  return (
    <SetupProvider value={setup}>
      <Routes>
        {/* вход и согласие (облачная установка) — без навигации */}
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/consent" element={<ConsentPage />} />
        <Route
          path="*"
          element={
            <SessionProvider>
              <Shell />
            </SessionProvider>
          }
        />
      </Routes>
    </SetupProvider>
  );
}

export function App() {
  return (
    <Theme
      appearance="light"
      accentColor="yellow"
      grayColor="gray"
      radius="none"
      panelBackground="solid"
    >
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </Theme>
  );
}
