// Плашка в журнале: пока участник не подключил ассистента — зовём в раздел «Ассистент».
import { type AssistantStatus, fetchAssistant } from '@shared/api/client';
import { Glyph, Pictogram } from '@shared/ui/Pictogram';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'bus:assistant-banner-hidden';
const hidden = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export function AssistantBanner() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [dismissed, setDismissed] = useState(hidden);
  useEffect(() => {
    if (!dismissed)
      fetchAssistant()
        .then(setStatus)
        .catch(() => {});
  }, [dismissed]);
  if (dismissed || !status || status.connections.length > 0) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  };
  return (
    <aside className="assistant-banner" aria-label="Ассистент">
      <Link to="/assistant" className="assistant-banner__link">
        <Pictogram name="key" size={40} tone="yellow" />
        <span>
          <b className="assistant-banner__long">Записывайте поездки разговором</b>
          <b className="assistant-banner__short">Подключите Claude или ChatGPT</b>
          <span className="assistant-banner__sub">
            Подключите Claude или ChatGPT к журналу — пара минут
          </span>
        </span>
        <Glyph name="arrow" size={22} />
      </Link>
      <button type="button" className="assistant-banner__close" onClick={hide} aria-label="Скрыть">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden
        >
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>
    </aside>
  );
}
