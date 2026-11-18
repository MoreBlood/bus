// Табличка одометра на жёлтой полосе: знак, подпись, показание монументально.
import type { Journal } from '@shared/api/types';
import { longDate, num } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignLink } from '@shared/ui/SignButton';
import { forwardRef } from 'react';

export const OdometerBand = forwardRef<
  HTMLDivElement,
  { last: Journal['lastOdometer'] | undefined }
>(function OdometerBand({ last }, ref) {
  return (
    <section className="band" aria-label="Одометр">
      <div className="band__inner band__inner--journal">
        <div className={`odo-sign${last === null ? ' odo-sign--empty' : ''}`} ref={ref}>
          <Pictogram name="gauge" size={48} />
          <span className="odo-sign__label">
            Одометр
            {last === null && <small>появится после первой поездки по одометру</small>}
          </span>
          {last === undefined && (
            <span
              className="odo-sign__value skeleton"
              style={{ width: '6.2ch', color: 'transparent' }}
            >
              000 000
            </span>
          )}
          {last && (
            <span className="odo-sign__value">
              {num(last.km)}
              <span className="odo-sign__unit">км</span>
            </span>
          )}
          {last !== null && (
            <span className="odo-sign__meta">
              {last ? `по последней записи, ${longDate(last.date)}` : '\u00a0'}
            </span>
          )}
        </div>
        <div className="band__cta">
          <SignLink to="/trips/new" tone="black">
            Записать поездку
          </SignLink>
        </div>
      </div>
    </section>
  );
});
