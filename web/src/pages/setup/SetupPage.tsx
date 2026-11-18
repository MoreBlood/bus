import type { Setup } from '@shared/api/types';
import { Pictogram } from '@shared/ui/Pictogram';

/** Облачная установка без переменных входа: что настроить, с точными адресами. */
export function SetupPage({ setup }: { setup: Setup }) {
  return (
    <div className="gate">
      <header className="band">
        <div className="band__inner">
          <div className="assistant-sign" style={{ paddingBottom: 24 }}>
            <Pictogram name="van" size={56} />
            <h1 className="assistant-title" style={{ fontSize: 'clamp(30px, 8vw, 44px)' }}>
              Осталось настроить вход
            </h1>
          </div>
        </div>
      </header>
      <main className="gate__body" style={{ maxWidth: 680 }}>
        <div className="prose">
          <p>
            1. Создайте{' '}
            <a href="https://github.com/settings/applications/new">OAuth App на GitHub</a>: Homepage
            URL — <code>{setup.baseUrl}</code>, Authorization callback URL —{' '}
            <code>{setup.githubCallbackUrl}</code>.
          </p>
          <p>
            2. В Vercel → Settings → Environment Variables добавьте <code>GITHUB_CLIENT_ID</code>,{' '}
            <code>GITHUB_CLIENT_SECRET</code> и <code>ADMIN_GITHUB_USERS</code> — свой логин GitHub
            (несколько — через запятую).
          </p>
          <p>3. Deployments → ⋯ → Redeploy. Пока вход не настроен, данные закрыты.</p>
        </div>
      </main>
    </div>
  );
}
