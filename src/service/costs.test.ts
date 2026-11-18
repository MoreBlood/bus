import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amortFromBasis,
  type CostTrip,
  DEFAULT_SETTINGS,
  fuelIntervals,
  fuelUsed,
  ledger,
  moneySummary,
  periodFor,
  repairShares,
  type RatePeriod,
  tripCost,
  tripRates,
} from './costs.ts';

const rates = { amortPerKm: 0.3, fuelPerKm: 0.7 };
const trip = (p: Partial<CostTrip>): CostTrip => ({ date: '2026-11-14', endDate: null, km: 100, shared: false, riders: [], ...p });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);
const period = (validFrom: string, fuelPrice: number, amortPerKm = 0.3): RatePeriod => ({
  id: validFrom,
  validFrom,
  amortPerKm,
  fuelPer100: 10,
  fuelPrice,
  basis: null,
  createdBy: null,
  createdAt: null,
});

describe('tripCost', () => {
  it('один водитель для своих нужд платит всё', () => {
    const c = tripCost(trip({ riders: [{ memberId: 'misha', guests: 0 }] }), rates);
    assert.equal(c.heads, 1);
    near(c.riders[0].amort, 30);
    near(c.riders[0].fuel, 70);
    assert.equal(c.riders[0].days, 1);
  });

  it('гости делят поровну, их доля — на пригласившего', () => {
    const c = tripCost(trip({ km: 268, riders: [{ memberId: 'misha', guests: 1 }, { memberId: 'anya', guests: 0 }] }), rates);
    assert.equal(c.heads, 3);
    near(c.riders[0].amort + c.riders[0].fuel, (268 * 2) / 3);
    near(c.riders[1].amort + c.riders[1].fuel, 268 / 3);
  });

  it('хозяин сам не ехал: доли только у гостей, записаны на него, день — его', () => {
    const c = tripCost(trip({ riders: [{ memberId: 'misha', guests: 2, absent: true }] }), rates);
    assert.equal(c.heads, 2);
    near(c.perHead, 50);
    near(c.riders[0].amort + c.riders[0].fuel, 100);
    assert.equal(c.riders[0].days, 1);
  });

  it('дороги и парковки делятся вместе с поездкой', () => {
    const c = tripCost(trip({ extras: 60, riders: [{ memberId: 'a', guests: 1 }, { memberId: 'b', guests: 0 }] }), rates);
    near(c.total, 160);
    near(c.riders[0].extras, 40);
    near(c.riders[1].extras, 20);
  });

  it('день делится между владельцами, гости дней не занимают', () => {
    const c = tripCost(
      trip({ endDate: '2026-11-15', riders: [{ memberId: 'a', guests: 3 }, { memberId: 'b', guests: 0 }, { memberId: 'c', guests: 0 }] }),
      rates,
    );
    for (const r of c.riders) near(r.days, 2 / 3);
  });

  it('поездка по делам буса ни на кого не записывается', () => {
    const c = tripCost(trip({ shared: true, riders: [{ memberId: 'misha', guests: 0 }] }), rates);
    assert.equal(c.perHead, 0);
    near(c.total, 100);
  });
});

describe('ставки по дате', () => {
  const periods = [period('2000-01-01', 6), period('2026-07-01', 7)];
  it('поездка считается по периоду, в который попала', () => {
    assert.equal(periodFor(periods, '2026-03-10').fuelPrice, 6);
    assert.equal(periodFor(periods, '2026-07-01').fuelPrice, 7);
    near(tripRates({ date: '2026-03-10', odoStart: null, odoEnd: null }, periods, DEFAULT_SETTINGS, []).fuelPerKm, 0.6);
    near(tripRates({ date: '2026-08-10', odoStart: null, odoEnd: null }, periods, DEFAULT_SETTINGS, []).fuelPerKm, 0.7);
  });
});

describe('учёт заправок по полным бакам', () => {
  const refuels = [
    { date: '2026-01-05', odometer: 1000, liters: 60, amount: 390, full: true },
    { date: '2026-01-20', odometer: 1300, liters: 15, amount: 100, full: false },
    { date: '2026-02-01', odometer: 1600, liters: 45, amount: 290, full: true },
  ];
  const iv = fuelIntervals(refuels);

  it('отрезок от полного бака до полного: всё залитое израсходовано на этих км', () => {
    assert.equal(iv.length, 1);
    assert.equal(iv[0].km, 600);
    assert.equal(iv[0].units, 60);
    near(iv[0].per100, 10);
    near(iv[0].perKm, 390 / 600);
  });

  it('первая заправка года не даёт скачка ставки', () => {
    const one = fuelIntervals([refuels[0]]);
    assert.equal(one.length, 0);
  });

  it('поездка внутри отрезка — по нему, в открытом баке — по ближайшему', () => {
    const s = { ...DEFAULT_SETTINGS, fuelMode: 'refuels' as const };
    const inside = tripRates({ date: '2026-01-10', odoStart: 1100, odoEnd: 1200 }, [], s, iv);
    assert.equal(inside.source, 'refuels');
    near(inside.fuelPerKm, 0.65);
    const open = tripRates({ date: '2026-02-10', odoStart: 1650, odoEnd: 1700 }, [], s, iv);
    assert.equal(open.source, 'refuels-nearest');
  });
});

describe('moneySummary и учёт долгов', () => {
  const r = { amortPerKm: 0.3, fuelPerKm: 1 };
  const trips = [
    trip({ km: 300, riders: [{ memberId: 'misha', guests: 2 }] }),
    trip({ km: 100, riders: [{ memberId: 'anya', guests: 0 }] }),
    trip({ km: 100, shared: true, riders: [] }),
  ].map((t) => ({ ...t, cost: tripCost(t, r, '2026') }));
  const s = moneySummary(trips, { km: 37, cost: 48.1, fuel: 37 });

  it('итоги по владельцам и кассе, неучтённые км — на кассе', () => {
    const misha = s.members.find((m) => m.memberId === 'misha');
    assert.equal(misha?.guests, 2);
    near(misha?.fuel ?? 0, 300);
    near(s.fund.fuel, 100);
    assert.equal(s.fund.unrecordedKm, 37);
  });

  it('долги гасятся переводами', () => {
    const { accounts, settlements } = ledger(fuelUsed(s), [{ paidBy: 'anya', amount: 537 }], []);
    near(accounts.reduce((sum, a) => sum + a.balance, 0), 0);
    // касса везёт и поездку по делам буса (100), и неучтённые 37 км (37)
    assert.deepEqual(settlements, [
      { from: 'misha', to: 'anya', amount: 300 },
      { from: null, to: 'anya', amount: 137 },
    ]);
    const after = ledger(fuelUsed(s), [{ paidBy: 'anya', amount: 537 }], [{ fromId: 'misha', toId: 'anya', amount: 300 }]);
    assert.deepEqual(after.settlements, [{ from: null, to: 'anya', amount: 137 }]);
  });
});

describe('порядок переводов', () => {
  it('сначала рассчитываются люди, касса — последней', () => {
    const s = moneySummary([trip({ km: 100, riders: [{ memberId: 'misha', guests: 0 }] })].map((t) => ({ ...t, cost: tripCost(t, { amortPerKm: 0, fuelPerKm: 1 }) })), {
      km: 500,
      cost: 500,
      fuel: 500,
    });
    // Аня заплатила 300; касса «должна» 500 за неучтённые км, Миша — 100 за свою поездку
    const { settlements } = ledger(fuelUsed(s), [{ paidBy: 'anya', amount: 300 }], []);
    assert.deepEqual(settlements[0], { from: 'misha', to: 'anya', amount: 100 });
    assert.deepEqual(settlements[1], { from: null, to: 'anya', amount: 200 });
  });
});

describe('помощник амортизации', () => {
  it('сумма статей в год / км в год', () => {
    const rate = amortFromBasis({
      items: [
        { label: 'ТО и масло', perYear: 1500 },
        { label: 'Шины', perYear: 800 },
        { label: 'Ремонт', perYear: 2000 },
        { label: 'Потеря стоимости', perYear: 3000 },
        { label: 'AdBlue', perYear: 300 },
      ],
      kmPerYear: 25000,
    });
    near(rate, 0.304);
  });
});

describe('ремонт из резерва', () => {
  const owners = ['misha', 'anya', 'kostya'];
  // Миша наездил износа на 300, Аня на 100, Костя — ничего
  const accruals = [
    { date: '2026-03-01', memberId: 'misha', amort: 300 },
    { date: '2026-03-05', memberId: 'anya', amort: 100 },
  ];
  const repair = (id: string, date: string, amount: number, p: Partial<{ kind: 'repair' | 'upgrade'; chargedTo: string }> = {}) => ({
    id,
    date,
    amount,
    kind: p.kind ?? ('repair' as const),
    chargedTo: p.chargedTo ?? null,
  });
  const share = (r: ReturnType<typeof repairShares>, id: string, m: string) =>
    r.splits.get(id)?.shares.find((x) => x.memberId === m)?.amount ?? 0;

  it('ремонт делится по тому, кто сколько износил', () => {
    const r = repairShares(accruals, [repair('r1', '2026-04-01', 200)], owners);
    near(share(r, 'r1', 'misha'), 150);
    near(share(r, 'r1', 'anya'), 50);
    assert.equal(share(r, 'r1', 'kostya'), 0);
    near(r.reserve.left, 200);
    near(r.reserve.spent, 200);
  });

  it('не хватило резерва — остаток поровну на владельцев', () => {
    const r = repairShares(accruals, [repair('r1', '2026-04-01', 700)], owners);
    near(share(r, 'r1', 'misha'), 300 + 100);
    near(share(r, 'r1', 'anya'), 100 + 100);
    near(share(r, 'r1', 'kostya'), 100);
    near(r.reserve.overflow, 300);
    near(r.reserve.left, 0);
  });

  it('износ после ремонта в него не идёт', () => {
    const r = repairShares(accruals, [repair('r1', '2026-03-02', 100)], owners);
    near(share(r, 'r1', 'misha'), 100);
    assert.equal(share(r, 'r1', 'anya'), 0);
  });

  it('улучшение — поровну, поломка по вине — на виновнике, резерв не трогают', () => {
    const r = repairShares(accruals, [repair('u', '2026-04-01', 900, { kind: 'upgrade' }), repair('f', '2026-04-02', 120, { chargedTo: 'kostya' })], owners);
    near(share(r, 'u', 'anya'), 300);
    near(share(r, 'f', 'kostya'), 120);
    near(r.reserve.left, 400);
  });

  it('нехватку делят те, кто был совладельцем в день ремонта', () => {
    const owners = (date: string) => (date < '2026-06-01' ? ['misha', 'anya', 'petya'] : ['misha', 'anya']);
    const r = repairShares([], [repair('a', '2026-05-01', 300), repair('b', '2026-07-01', 300)], owners);
    near(share(r, 'a', 'petya'), 100);
    assert.equal(share(r, 'b', 'petya'), 0);
    near(share(r, 'b', 'anya'), 150);
  });

  it('кто заплатил в сервисе, тому возвращают доли', () => {
    const r = repairShares(accruals, [repair('r1', '2026-04-01', 200)], owners);
    const used = r.splits.get('r1')?.shares.map((x) => ({ id: x.memberId, amount: x.amount })) ?? [];
    const { settlements } = ledger(used, [{ paidBy: 'anya', amount: 200 }], []);
    assert.deepEqual(settlements, [{ from: 'misha', to: 'anya', amount: 150 }]);
  });
});
