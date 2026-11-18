// Ремонт и ТО: резерв на ремонт (сколько износа начислено и сколько ушло) и записи года с тем, как поделены.
import type { Money, Repair } from '@shared/api/types';
import { num, shortDate, zl, zlRate } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { Link } from 'react-router-dom';

const KIND: Record<Repair['kind'], string> = {
  repair: 'ремонт',
  service: 'ТО',
  tires: 'шины',
  other: 'прочее',
  upgrade: 'улучшение',
};

export function RepairsSection({
  money: m,
  name,
}: {
  money: Money;
  name: (id: string | null) => string;
}) {
  const r = m.reserve;
  const top = Math.max(1, ...r.members.map((x) => x.left));
  const how = (x: Repair) =>
    x.chargedTo
      ? `за счёт ${name(x.chargedTo)}`
      : x.kind === 'upgrade'
        ? 'поровну на владельцев'
        : x.split && x.split.overflow > 0
          ? `из резерва ${zl(x.split.fromReserve)} + поровну ${zl(x.split.overflow)}`
          : 'из резерва';
  return (
    <section className="section" aria-labelledby="repairs-title">
      <div className="section__head">
        <h2 className="section__title" id="repairs-title">
          Ремонт и ТО
        </h2>
        <Link to="/repairs/new" className="text-button">
          Записать
        </Link>
      </div>

      <div className="reserve">
        <div className="money-row">
          <div>
            <div className="person__name">Резерв на ремонт</div>
            <div className="person__meta">
              <span>начислено износом {zl(r.accrued)}</span>
              <span>ушло на ремонты {zl(r.spent)}</span>
            </div>
          </div>
          <div className="money-row__sum">
            <b>{zl(r.left)}</b>
            <small>осталось</small>
          </div>
        </div>
        {r.members.length > 0 && (
          <ul className="reserve__members" aria-label="Резерв за каждым владельцем">
            {r.members.map((x) => (
              <li key={x.memberId}>
                <span>{name(x.memberId)}</span>
                <span className="reserve__bar" aria-hidden>
                  <span style={{ width: `${(Math.max(0, x.left) / top) * 100}%` }} />
                </span>
                <b>{zl(x.left)}</b>
              </li>
            ))}
          </ul>
        )}
        <p className="field__hint">
          Полоски — сколько резерва ещё за каждым. Амортизацию никто никуда не переводит: это износ,
          который каждый начислил своими км. Ремонт гасится из резерва — кто больше ездит, тот
          больше и платит; кто заплатил в сервисе, тому возвращают в «Кто кому должен».
          {r.overflow > 0 &&
            ` Ремонтов было больше резерва на ${zl(r.overflow)} — эту часть разделили поровну.`}
        </p>
        {m.fact.perKm !== null && (
          <p className="field__hint">
            По факту за 12 месяцев: ремонты {zl(m.fact.spent)} на {num(m.fact.km)} км ={' '}
            <b>{zlRate(m.fact.perKm)}</b> за км, а ставка амортизации — {zlRate(m.rates.amortPerKm)}
            .
          </p>
        )}
      </div>

      {m.repairs.length > 0 ? (
        <ul className="feed">
          {m.repairs.map((x) => (
            <li key={x.id}>
              <Link to={`/repairs/${x.id}`} className="trip-row">
                <Pictogram name="toolbox" size={40} />
                <span className="trip-row__main">
                  <span className="trip-row__title">
                    {x.title}
                    {x.createdBy === 'demo' && (
                      <>
                        {' '}
                        <span className="tag tag--muted demo-tag">демо</span>
                      </>
                    )}
                  </span>
                  <span className="trip-row__meta">
                    {shortDate(x.date)} · {KIND[x.kind]} ·{' '}
                    {x.paidBy ? `платил(а) ${name(x.paidBy)}` : 'из кассы'} · {how(x)}
                    {x.odometer ? ` · ${num(x.odometer)} км` : ''}
                  </span>
                </span>
                <span className="trip-row__km">
                  {num(x.amount)}
                  <small>zł</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="prose">
          За {m.year} ремонтов не записано. Сломалось, поменяли масло или шины — запишите: сумма
          разойдётся по резерву.
        </p>
      )}
    </section>
  );
}
