import { Select } from '@radix-ui/themes';
import { errorText, fetchJournal } from '@shared/api/client';
import type { Journal } from '@shared/api/types';
import { km } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignLink } from '@shared/ui/SignButton';
import { AssistantBanner } from '@widgets/assistant-banner/AssistantBanner';
import { MemberTotals, YearLine } from '@widgets/member-totals/MemberTotals';
import { OdometerBand } from '@widgets/odometer-band/OdometerBand';
import { Topbar } from '@widgets/topbar/Topbar';
import { TripFeed } from '@widgets/trip-feed/TripFeed';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/** Табличка одометра ушла под полосу — полоса показывает значение сама. */
function useOutOfView(ref: React.RefObject<HTMLElement | null>) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOut(!e.isIntersecting), {
      rootMargin: '-72px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return out;
}

export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const freshId = (location.state as { fresh?: string } | null)?.fresh;
  const { members, memberById, viewer, loading: sessionLoading } = useSession();
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const year = params.get('year') ?? undefined;
  const odoRef = useRef<HTMLDivElement>(null);
  const compact = useOutOfView(odoRef);

  const load = useCallback(() => {
    fetchJournal(year)
      .then((j) => {
        setJournal(j);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, [year]);

  useEffect(load, [load]);
  // друзья пишут в тот же журнал — обновляемся, когда вкладка снова на экране
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const last = journal ? journal.lastOdometer : undefined;
  return (
    <>
      <Topbar section="Бортжурнал" compact={compact} compactValue={last ? km(last.km) : undefined}>
        {journal && (
          <Select.Root
            value={journal.year}
            onValueChange={(y) => setParams(y === journal.years[0] ? {} : { year: y })}
          >
            <Select.Trigger className="year-select" aria-label="Год журнала" />
            <Select.Content position="popper">
              {journal.years.map((y) => (
                <Select.Item key={y} value={y}>
                  {y}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      </Topbar>
      <OdometerBand ref={odoRef} last={last} />
      <div className="page">
        {error && (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <Pictogram name="warning" size={32} />
            <span>
              Журнал не загрузился: {error}.{' '}
              <button type="button" className="inline-link" onClick={load}>
                Повторить
              </button>
            </span>
          </div>
        )}
        <AssistantBanner />
        {(!journal || sessionLoading) && !error && <JournalSkeleton />}
        {journal && !sessionLoading && (
          <div className="journal-grid">
            <div className="journal-grid__side">
              <YearLine journal={journal} />
              <MemberTotals journal={journal} members={members} meId={viewer?.memberId ?? null} />
            </div>
            <section className="section journal-grid__feed" aria-labelledby="feed-title">
              <div className="section__head">
                <h2 className="section__title" id="feed-title">
                  Поездки
                </h2>
                {journal.issues.length > 0 && (
                  <span className="section__aside">
                    {journal.issues.length === 1
                      ? '1 разрыв одометра'
                      : `разрывов одометра: ${journal.issues.length}`}
                  </span>
                )}
              </div>
              {journal.trips.length > 0 ? (
                <TripFeed journal={journal} byId={memberById} freshId={freshId} />
              ) : (
                <div className="empty">
                  <Pictogram name="van" size={48} />
                  <h3 className="empty__title">За {journal.year} поездок нет</h3>
                  <p className="empty__text">
                    Запишите первую: укажите показания одометра до и после — пробег посчитается сам,
                    а следующая поездка начнётся с того места, где закончилась эта.
                  </p>
                  <div style={{ maxWidth: 360 }}>
                    <SignLink to="/trips/new" size="md">
                      Записать поездку
                    </SignLink>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function JournalSkeleton() {
  return (
    <div aria-busy aria-label="Загрузка журнала" style={{ paddingTop: 20 }}>
      <div className="skeleton" style={{ height: 40, width: '60%' }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 56, marginTop: 14 }} />
      ))}
    </div>
  );
}
