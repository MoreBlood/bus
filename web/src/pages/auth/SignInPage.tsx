import { authClient } from '@shared/auth/client';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Better Auth возвращает коды ошибок — переводим в понятный текст. */
function explain(code: string | null) {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c.includes('forbidden') || c.includes('unable_to_create_user') || c.includes('signup'))
    return 'Этого GitHub-логина нет в списке участников. Попросите админа добавить вас в «Участниках».';
  if (c.includes('state') || c.includes('please_restart'))
    return 'Вход прервался. Попробуйте ещё раз.';
  return code.replace(/_/g, ' ');
}

/** Вход через GitHub. Сюда же Better Auth приводит при подключении ассистента (MCP). */
export function SignInPage() {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(explain(params.get('error')));
  const mcpFlow = params.has('client_id');

  const signIn = () => {
    setBusy(true);
    setError(null);
    authClient.signIn
      .social({
        provider: 'github',
        callbackURL: params.get('callbackURL') || '/',
        errorCallbackURL: '/sign-in',
      })
      .then(
        (r) => r.error && setError(explain(r.error.message ?? r.error.code ?? 'Не удалось войти')),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="gate">
      <header className="band">
        <div className="band__inner">
          <div className="assistant-sign" style={{ paddingBottom: 24 }}>
            <Pictogram name="van" size={56} />
            <h1 className="assistant-title">Бус</h1>
            <p className="odo-sign__meta">
              Общий бортжурнал: поездки, личный пробег и дни совладельцев.
            </p>
          </div>
        </div>
      </header>
      <main className="gate__body">
        <h2 className="gate__title">
          {mcpFlow ? 'Подключение ассистента' : 'Вход для участников'}
        </h2>
        <p className="prose">
          {mcpFlow
            ? 'Войдите через GitHub, чтобы ассистент вёл журнал от вашего имени.'
            : 'Пускает только совладельцев, чей GitHub-логин добавлен в список участников.'}
        </p>
        {error && (
          <div className="notice notice--error" role="alert" style={{ margin: '16px 0' }}>
            <Pictogram name="warning" size={32} />
            <span>{error}</span>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <SignButton loading={busy} onClick={signIn}>
            Войти через GitHub
          </SignButton>
        </div>
      </main>
    </div>
  );
}
