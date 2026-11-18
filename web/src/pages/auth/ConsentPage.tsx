import { authClient } from '@shared/auth/client';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type PublicClient = { client_name?: string; logo_uri?: string; client_uri?: string };

/** Согласие на доступ ассистента (claude.ai, ChatGPT…) — шаг OAuth, которым управляет Better Auth. */
export function ConsentPage() {
  const [params] = useSearchParams();
  const clientId = params.get('client_id') ?? '';
  const [client, setClient] = useState<PublicClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId)
      authClient.oauth2
        .publicClient({ query: { client_id: clientId } })
        .then((r) => setClient((r.data as PublicClient) ?? {}))
        .catch(() => setClient({}));
  }, [clientId]);

  const decide = (accept: boolean) => {
    setBusy(true);
    authClient.oauth2
      .consent({ accept })
      .then((r) => {
        const uri = (r.data as { redirect_uri?: string } | null)?.redirect_uri;
        if (uri) window.location.href = uri;
        else setError(r.error?.message ?? 'Не удалось завершить подключение');
      })
      .finally(() => setBusy(false));
  };

  const name = client?.client_name || 'Ассистент';
  return (
    <div className="gate">
      <header className="band">
        <div className="band__inner">
          <div className="assistant-sign" style={{ paddingBottom: 24 }}>
            <Pictogram name="key" size={56} />
            <h1 className="assistant-title" style={{ fontSize: 'clamp(30px, 8vw, 44px)' }}>
              Подключить «{name}»?
            </h1>
          </div>
        </div>
      </header>
      <main className="gate__body">
        <p className="prose">
          {name} получит доступ к бортжурналу буса: прочитает поездки и участников, сможет
          записывать, менять и удалять поездки от вашего имени. Отключить доступ можно в настройках
          коннекторов ассистента.
        </p>
        {error && (
          <div className="notice notice--error" role="alert" style={{ margin: '16px 0' }}>
            <Pictogram name="warning" size={32} />
            <span>{error}</span>
          </div>
        )}
        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          <SignButton loading={busy} onClick={() => decide(true)}>
            Разрешить
          </SignButton>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Отклонить
          </button>
        </div>
      </main>
    </div>
  );
}
