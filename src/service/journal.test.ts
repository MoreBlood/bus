import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lastOdometer, odometerIssues, summarize, type TripLike, tripDays } from './journal.ts';

const trip = (p: Partial<TripLike> & Pick<TripLike, 'id' | 'date' | 'km'>): TripLike => ({
  endDate: null,
  odoStart: null,
  odoEnd: null,
  ...p,
});

describe('tripDays', () => {
  it('однодневная поездка — один день', () => {
    assert.deepEqual(tripDays({ date: '2026-11-14', endDate: null }), ['2026-11-14']);
  });
  it('многодневная — все дни включительно, через границу месяца', () => {
    assert.deepEqual(tripDays({ date: '2026-10-31', endDate: '2026-11-02' }), ['2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('дата возвращения раньше выезда не ломает расчёт', () => {
    assert.deepEqual(tripDays({ date: '2026-11-14', endDate: '2026-11-10' }), ['2026-11-14']);
  });
});

describe('summarize', () => {
  it('делит пробег на поездки владельцев и по делам буса, считает гостей', () => {
    const s = summarize([
      { ...trip({ id: '1', date: '2026-11-14', km: 100 }), shared: false, riders: [{ guests: 2 }, { guests: 0 }] },
      { ...trip({ id: '2', date: '2026-11-15', km: 42 }), shared: true, riders: [] },
    ]);
    assert.deepEqual(s, { totalKm: 142, personalKm: 100, sharedKm: 42, trips: 2, guests: 2 });
  });
});

describe('odometerIssues', () => {
  it('находит незаписанные км между поездками', () => {
    const issues = odometerIssues([
      trip({ id: 'a', date: '2026-11-09', km: 42, odoStart: 184151, odoEnd: 184193 }),
      trip({ id: 'b', date: '2026-11-14', km: 268, odoStart: 184230, odoEnd: 184498 }),
    ]);
    assert.deepEqual(issues, [{ kind: 'gap', afterId: 'a', beforeId: 'b', fromOdo: 184193, toOdo: 184230, km: 37, date: '2026-11-14' }]);
  });
  it('поездка километрами между соседями закрывает разрыв', () => {
    const issues = odometerIssues([
      trip({ id: 'a', date: '2026-11-09', km: 42, odoStart: 184151, odoEnd: 184193 }),
      trip({ id: 'm', date: '2026-11-11', km: 37 }),
      trip({ id: 'b', date: '2026-11-14', km: 268, odoStart: 184230, odoEnd: 184498 }),
    ]);
    assert.deepEqual(issues, []);
  });
  it('пересечение показаний — возможная двойная запись', () => {
    const [issue] = odometerIssues([
      trip({ id: 'a', date: '2026-11-09', km: 100, odoStart: 1000, odoEnd: 1100 }),
      trip({ id: 'b', date: '2026-11-10', km: 50, odoStart: 1080, odoEnd: 1130 }),
    ]);
    assert.equal(issue.kind, 'overlap');
    assert.equal(issue.km, 20);
  });
});

describe('lastOdometer', () => {
  it('берёт наибольшее конечное показание', () => {
    assert.deepEqual(
      lastOdometer([
        trip({ id: 'a', date: '2026-11-14', km: 268, odoStart: 184230, odoEnd: 184498 }),
        trip({ id: 'b', date: '2026-11-09', km: 42, odoStart: 184151, odoEnd: 184193 }),
        trip({ id: 'c', date: '2026-11-20', km: 10 }),
      ]),
      { km: 184498, date: '2026-11-14' },
    );
  });
  it('нет одометра — null', () => {
    assert.equal(lastOdometer([trip({ id: 'c', date: '2026-11-20', km: 10 })]), null);
  });
});
