import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type CostTrip, DEFAULT_SETTINGS, fuelLedger, moneySummary, ratesFor, tripCost } from './costs.ts';

const rates = { amortPerKm: 0.3, fuelPerKm: 0.7, fuelSource: 'settings' as const };
const trip = (p: Partial<CostTrip>): CostTrip => ({ date: '2026-11-14', endDate: null, km: 100, shared: false, riders: [], ...p });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);

describe('tripCost', () => {
  it('один водитель для своих нужд платит всё', () => {
    const c = tripCost(trip({ riders: [{ memberId: 'misha', guests: 0 }] }), rates);
    assert.equal(c.heads, 1);
    near(c.riders[0].amort, 30);
    near(c.riders[0].fuel, 70);
    assert.equal(c.riders[0].days, 1);
  });

  it('гости делят поровну, их доля — на пригласившего', () => {
    const c = tripCost(
      trip({ km: 268, riders: [{ memberId: 'misha', guests: 1 }, { memberId: 'anya', guests: 0 }] }),
      rates,
    );
    assert.equal(c.heads, 3);
    near(c.perHead, 268 / 3);
    near(c.riders[0].amort + c.riders[0].fuel, (268 * 2) / 3);
    near(c.riders[1].amort + c.riders[1].fuel, 268 / 3);
    near(c.riders[0].km, (268 * 2) / 3);
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
    assert.equal(c.riders[0].amort, 0);
    near(c.total, 100);
  });
});

describe('ratesFor', () => {
  it('бак на бак — ставка из настроек', () => {
    const r = ratesFor(DEFAULT_SETTINGS, { refuelAmount: 500, km: 1000 });
    near(r.fuelPerKm, 0.715);
    assert.equal(r.fuelSource, 'settings');
  });
  it('учёт заправок — по факту года, без заправок — по настройкам', () => {
    const s = { ...DEFAULT_SETTINGS, fuelMode: 'refuels' as const };
    near(ratesFor(s, { refuelAmount: 680, km: 1000 }).fuelPerKm, 0.68);
    assert.equal(ratesFor(s, { refuelAmount: 0, km: 1000 }).fuelSource, 'settings');
  });
});

describe('moneySummary и fuelLedger', () => {
  const trips = [
    trip({ km: 300, riders: [{ memberId: 'misha', guests: 2 }] }),
    trip({ km: 100, riders: [{ memberId: 'anya', guests: 0 }] }),
    trip({ km: 100, shared: true, riders: [] }),
  ];
  const r = { amortPerKm: 0.3, fuelPerKm: 1, fuelSource: 'refuels' as const };
  const s = moneySummary(trips, r, '2026');

  it('итоги по владельцам и кассе', () => {
    const misha = s.members.find((m) => m.memberId === 'misha');
    assert.equal(misha?.guests, 2);
    near(misha?.fuel ?? 0, 300);
    near(s.fund.fuel, 100);
  });

  it('долги за бензин сходятся в ноль и гасятся переводами', () => {
    // Аня заплатила за всё (500 zł), Миша израсходовал 300, касса — 100, сама Аня — 100
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
