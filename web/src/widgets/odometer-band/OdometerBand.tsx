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
        <div className="odo-sign" ref={ref}>
          <Pictogram name="gauge" size={48} />
          <span className="odo-sign__label">Одометр</span>
          {last === undefined ? (
            <span
              className="odo-sign__value skeleton"
              style={{ width: '6.2ch', color: 'transparent' }}
            >
              000 000
            </span>
          ) : last ? (
            <span className="odo-sign__value">
              {num(last.km)}
              <span className="odo-sign__unit">км</span>
            </span>
          ) : (
            <span className="odo-sign__value">—</span>
          )}
          <span className="odo-sign__meta">
            {last === undefined
              ? ' '
              : last
                ? `по последней записи, ${longDate(last.date)}`
                : 'Показаний ещё нет: запишите поездку по одометру'}
          </span>
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
