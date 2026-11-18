// Итоги года: общий пробег одной строкой и личные км и дни по участникам.
import type { Journal, Member } from '@shared/api/types';
import { daysShort, km, num, plural } from '@shared/lib/format';

export function YearLine({ journal }: { journal: Journal }) {
  const s = journal.summary;
  return (
    <div className="year-line">
      <span className="year-line__label">За {journal.year} год</span>
      <span className="year-line__value">{km(s.totalKm)}</span>
      <span className="year-line__split">
        личных {num(s.personalKm)} · общих {num(s.sharedKm)} · {s.trips}{' '}
        {plural(s.trips, 'поездка', 'поездки', 'поездок')}
      </span>
    </div>
  );
}

export function MemberTotals({
  journal,
  members,
  meId,
}: {
  journal: Journal;
  members: Member[];
  meId: string | null;
}) {
  const totals = new Map(journal.summary.members.map((t) => [t.memberId, t]));
  // кто ездил — по убыванию км; остальные активные — одной строкой ниже
  const rows = journal.summary.members
    .map((t) => ({ t, m: members.find((m) => m.id === t.memberId) }))
    .filter((r) => r.m);
  const idle = members.filter((m) => m.active && !totals.has(m.id));
  return (
    <section className="section" aria-labelledby="totals-title">
      <div className="section__head">
        <h2 className="section__title" id="totals-title">
          Личный пробег
        </h2>
        <span className="section__aside">км · дни</span>
      </div>
      {rows.length > 0 ? (
        <ul className="totals">
          {rows.map(({ t, m }) => (
            <li key={t.memberId} className="totals__row">
              <span className="totals__name">
                {m?.name}
                {t.memberId === meId && <span className="totals__me">вы</span>}
              </span>
              <span className="totals__value">
                <b>{num(t.km)}</b> · {daysShort(t.days)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="totals__idle">Личных поездок за {journal.year} ещё нет.</p>
      )}
      {idle.length > 0 && rows.length > 0 && (
        <p className="totals__idle">Без личных поездок: {idle.map((m) => m.name).join(', ')}</p>
      )}
    </section>
  );
}
