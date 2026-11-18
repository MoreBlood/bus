// Ключевая фишка: каждый участник подключает своего ассистента (Claude, ChatGPT, Claude Code)
// к журналу по MCP и записывает поездки разговором.
import { type AssistantStatus, errorText, fetchAssistant } from '@shared/api/client';
import { longDate } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { Topbar } from '@widgets/topbar/Topbar';
import { useEffect, useState } from 'react';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    });
  return { copied, copy };
}

const EXAMPLES = [
  'Запиши поездку: вчера ездили с Аней в Казимеж, я брал двоих друзей, одометр 181 232 → 181 500',
  'Я заправился: 62 литра, 403 злотых',
  'Сколько я должен за амортизацию в этом году?',
  'Кто кому должен за бензин?',
  'Кто не записал 37 км в ноябре?',
];

export function AssistantPage() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  useEffect(() => {
    fetchAssistant()
      .then(setStatus)
      .catch((e) => setError(errorText(e)));
  }, []);
  const url = status?.mcpUrl ?? '';
  const cli = `claude mcp add --transport http bus ${url}`;

  return (
    <>
      <Topbar section="Ассистент" />
      <section className="band">
        <div className="band__inner" style={{ paddingTop: 8, paddingBottom: 24 }}>
          <div className="assistant-sign">
            <Pictogram name="key" size={56} />
            <h1 className="assistant-title">Журнал — разговором</h1>
            <p className="odo-sign__meta">
              Claude или ChatGPT записывают поездки, считают ваш пробег и находят разрывы одометра.
              Каждый участник подключает своего — от своего имени.
            </p>
          </div>
        </div>
      </section>
      <div className="page">
        <div className="narrow">
          {error && (
            <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
              <Pictogram name="warning" size={32} />
              <span>{error}</span>
            </div>
          )}

          <section className="section" aria-labelledby="url-title">
            <h2 className="section__title" id="url-title" style={{ marginBottom: 10 }}>
              Адрес коннектора
            </h2>
            <div className="code-line">
              <code style={{ flex: 1 }}>{url || '…'}</code>
            </div>
            <div style={{ marginTop: 12 }}>
              <SignButton
                size="md"
                icon={copied === 'url' ? 'check' : 'copy'}
                disabled={!url}
                onClick={() => copy('url', url)}
              >
                {copied === 'url' ? 'Скопировано' : 'Скопировать адрес'}
              </SignButton>
            </div>
            {status && (
              <p className="field__hint" aria-live="polite">
                {status.connections.length > 0
                  ? `Подключено: ${status.connections
                      .map((c) =>
                        c.since ? `${c.name} (с ${longDate(c.since.slice(0, 10))})` : c.name,
                      )
                      .join(', ')}.`
                  : 'У вас пока ничего не подключено.'}
              </p>
            )}
            {status?.demo && (
              <div className="notice" role="note" style={{ marginTop: 12 }}>
                <Pictogram name="warning" size={32} />
                <span>
                  Это превью PR: ассистент подключится без входа и увидит только демо-журнал.
                  Настоящий журнал — на bus.akapps.click.
                </span>
              </div>
            )}
            {status?.local && (
              <div className="notice" role="note" style={{ marginTop: 12 }}>
                <Pictogram name="warning" size={32} />
                <span>
                  Это локальная копия для разработки: адрес доступен только с этого компьютера,
                  поэтому подключится лишь Claude Code. Боевой адрес — на bus.akapps.click.
                </span>
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="how-title">
            <h2 className="section__title" id="how-title" style={{ marginBottom: 6 }}>
              Как подключить
            </h2>
            <ul className="steps">
              <li>
                <b>Claude</b> — сайт, приложение на компьютере или телефоне: Настройки → Коннекторы
                → «Добавить свой коннектор», вставьте адрес, нажмите «Подключить». Войдите через
                GitHub и нажмите «Разрешить».
              </li>
              <li>
                <b>ChatGPT</b>: Настройки → Приложения и коннекторы → Расширенные → режим
                разработчика → «Создать». Адрес тот же, аутентификация — OAuth.
              </li>
              <li>
                <b>Claude Code</b> — одной командой в терминале, затем <code>/mcp</code> → bus →
                войти:
                <div className="code-line" style={{ marginTop: 8 }}>
                  <code style={{ flex: 1 }}>{url ? cli : '…'}</code>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!url}
                    onClick={() => copy('cli', cli)}
                  >
                    {copied === 'cli' ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <section className="section" aria-labelledby="say-title">
            <h2 className="section__title" id="say-title" style={{ marginBottom: 10 }}>
              Что можно сказать
            </h2>
            <ul className="says">
              {EXAMPLES.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="field__hint" style={{ marginTop: 14 }}>
              Ассистент видит журнал и участников и пишет от вашего имени: в записи будет ваш
              GitHub-логин. Отключить — в настройках коннекторов самого ассистента.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
