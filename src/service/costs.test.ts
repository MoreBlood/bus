import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amortFromBasis,
  type CostTrip,
  DEFAULT_SETTINGS,
  fuelIntervals,
  fuelLedger,
  moneySummary,
  periodFor,
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

describe('moneySummary и fuelLedger', () => {
  const r = { amortPerKm: 0.3, fuelPerKm: 1 };
  const trips = [
    trip({ km: 300, riders: [{ memberId: 'misha', guests: 2 }] }),
    trip({ km: 100, riders: [{ memberId: 'anya', guests: 0 }] }),
    trip({ km: 100, shared: true, riders: [] }),
  ].map((t) => ({ ...t, cost: tripCost(t, r, '2026') }));
  const s = moneySummary(trips, { km: 37, cost: 37 });

  it('итоги по владельцам и кассе, неучтённые км — на кассе', () => {
    const misha = s.members.find((m) => m.memberId === 'misha');
    assert.equal(misha?.guests, 2);
    near(misha?.fuel ?? 0, 300);
    near(s.fund.fuel, 100);
    assert.equal(s.fund.unrecordedKm, 37);
  });

  it('долги гасятся переводами', () => {
    const { accounts, settlements } = fuelLedger(s, [{ paidBy: 'anya', amount: 500 }], []);
    near(accounts.reduce((sum, a) => sum + a.balance, 0), 0);
    assert.deepEqual(settlements, [
      { from: 'misha', to: 'anya', amount: 300 },
      { from: null, to: 'anya', amount: 100 },
    ]);
    const after = fuelLedger(s, [{ paidBy: 'anya', amount: 500 }], [{ fromId: 'misha', toId: 'anya', amount: 300 }]);
    assert.deepEqual(after.settlements, [{ from: null, to: 'anya', amount: 100 }]);
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
