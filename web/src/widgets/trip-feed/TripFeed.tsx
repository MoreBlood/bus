// Лента поездок: строки-сообщения (знак, маршрут, дата · кто · одометр, км крупно)
// и жёлтые строки разрывов одометра между ними.
import type { Journal, Member, OdometerIssue, Trip } from '@shared/api/types';
import { dateRange, days, num, shortDate, tripDays, zl } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/** «Миша, Аня +2» — кто ехал одной строкой; гости — общим числом. */
export function ridersLabel(trip: Trip, byId: Map<string, Member>) {
  if (trip.shared) return 'По делам буса';
  const names = trip.riders.map((r) => byId.get(r.memberId)?.name ?? 'Участник удалён');
  const guests = trip.riders.reduce((s, r) => s + r.guests, 0);
  return `${names.join(', ')}${guests ? ` +${guests}` : ''}`;
}

function TripRow({ trip, byId, fresh }: { trip: Trip; byId: Map<string, Member>; fresh: boolean }) {
  const who = ridersLabel(trip, byId);
  const n = tripDays(trip.date, trip.endDate);
  const money = trip.shared
    ? 'из кассы'
    : trip.cost.heads > 1
      ? `по ${zl(trip.cost.perHead)}`
      : zl(trip.cost.total);
  const meta = [
    dateRange(trip.date, trip.endDate),
    trip.note ? who : null,
    n > 1 ? days(n) : null,
    trip.odoStart !== null && trip.odoEnd !== null
      ? `${num(trip.odoStart)} → ${num(trip.odoEnd)}`
      : 'без одометра',
    money,
  ].filter(Boolean);
  const heads = trip.cost.heads;
  return (
    <li>
      <Link to={`/trips/${trip.id}`} className={`trip-row${fresh ? ' is-fresh' : ''}`}>
        <Pictogram
          name={trip.shared ? 'wrench' : heads > 1 ? 'people' : 'person'}
          size={40}
          label={who}
        />
        <span className="trip-row__main">
          <span className="trip-row__title">
            {trip.note || who}
            {trip.createdBy === 'demo' && (
              <>
                {' '}
                <span className="tag tag--muted demo-tag">демо</span>
              </>
            )}
          </span>
          <span className="trip-row__meta">
            {meta.map((part, i) => (
              // точка остаётся в конце строки, перенос — после неё
              <Fragment key={part as string}>
                {i > 0 && '\u00a0· '}
                <span className="nowrap">{part}</span>
              </Fragment>
            ))}
          </span>
        </span>
        <span className="trip-row__km">
          {num(trip.km)}
          <small>км</small>
        </span>
      </Link>
    </li>
  );
}

function IssueRow({ issue, trips }: { issue: OdometerIssue; trips: Trip[] }) {
  const after = trips.find((t) => t.id === issue.afterId);
  const between = after
    ? `между ${shortDate(after.endDate ?? after.date)} и ${shortDate(issue.date)}`
    : `до ${shortDate(issue.date)}`;
  return (
    <li className="issue-row" role="note">
      <Pictogram name="warning" size={40} />
      <span className="issue-row__text">
        {issue.kind === 'gap' ? (
          <>
            <b>{num(issue.km)} км никто не записал</b> {between}
          </>
        ) : (
          <>
            <b>{num(issue.km)} км записаны дважды?</b> Показания пересекаются {between}
          </>
        )}
        <span className="issue-row__meta">
          одометр {num(issue.fromOdo)} → {num(issue.toOdo)}
        </span>
      </span>
    </li>
  );
}

export function TripFeed({
  journal,
  byId,
  freshId,
}: {
  journal: Journal;
  byId: Map<string, Member>;
  freshId?: string;
}) {
  // разрыв показываем сразу под поездкой, перед которой он случился (лента — новые сверху)
  const issuesBefore = new Map<string, OdometerIssue[]>();
  for (const i of journal.issues)
    issuesBefore.set(i.beforeId, [...(issuesBefore.get(i.beforeId) ?? []), i]);
  return (
    <ul className="feed" aria-label={`Поездки за ${journal.year}`}>
      {journal.trips.map((t) => (
        <Fragment key={t.id}>
          <TripRow trip={t} byId={byId} fresh={t.id === freshId} />
          {issuesBefore.get(t.id)?.map((i) => (
            <IssueRow key={`${i.afterId}-${i.beforeId}`} issue={i} trips={journal.trips} />
          ))}
        </Fragment>
      ))}
    </ul>
  );
}
