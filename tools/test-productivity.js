const assert = require('assert');
const productivity = require('../web/js/productivity');

function testMonthKey() {
  assert.strictEqual(productivity.monthKeyFromDate('2026-02-21T10:00:00Z'), '2026-02');
  assert.strictEqual(productivity.monthKeyFromDate('2025-11-15T12:00:00Z'), '2025-11');
}

function testUpsertAndFind() {
  let checkins = [];
  checkins = productivity.upsertCheckin(checkins, {
    monthKey: '2026-01',
    ratings: { mood: 3, focus: 4, energy: 2 },
    note: 'steady'
  });
  checkins = productivity.upsertCheckin(checkins, {
    monthKey: '2026-02',
    ratings: { mood: 4, focus: 5, energy: 3 },
    note: 'stronger'
  });

  assert.strictEqual(checkins.length, 2);
  assert.strictEqual(checkins[0].monthKey, '2026-02');
  assert.strictEqual(checkins[1].monthKey, '2026-01');
  assert.strictEqual(productivity.findByMonth(checkins, '2026-02').ratings.focus, 5);
  assert.strictEqual(productivity.findPrevious(checkins, '2026-02').monthKey, '2026-01');

  checkins = productivity.upsertCheckin(checkins, {
    monthKey: '2026-02',
    ratings: { mood: 2, focus: 2, energy: 2 },
    note: 'replace month'
  });
  assert.strictEqual(checkins.length, 2);
  assert.strictEqual(productivity.findByMonth(checkins, '2026-02').ratings.mood, 2);
}

function testMetricDelta() {
  const up = productivity.calculateMetricDelta(5, 3);
  assert.strictEqual(up.delta, 2);
  assert.strictEqual(up.direction, 'up');
  assert.strictEqual(up.formatted, '+2');

  const down = productivity.calculateMetricDelta(2, 4);
  assert.strictEqual(down.delta, -2);
  assert.strictEqual(down.direction, 'down');
  assert.strictEqual(down.formatted, '-2');

  const noBaseline = productivity.calculateMetricDelta(4, 0);
  assert.strictEqual(noBaseline.hasBaseline, false);
}

function testCheckinDelta() {
  const current = {
    monthKey: '2026-02',
    ratings: { mood: 4, focus: 3, energy: 5 }
  };
  const previous = {
    monthKey: '2026-01',
    ratings: { mood: 2, focus: 3, energy: 4 }
  };
  const delta = productivity.calculateCheckinDelta(current, previous);
  assert.strictEqual(delta.metrics.mood.delta, 2);
  assert.strictEqual(delta.metrics.focus.delta, 0);
  assert.strictEqual(delta.metrics.energy.delta, 1);
  assert.strictEqual(delta.average.current, 4);
  assert.strictEqual(delta.average.previous, 3);
  assert.strictEqual(delta.average.delta, 1);
  assert.strictEqual(delta.average.trend, 'up');
}

function run() {
  testMonthKey();
  testUpsertAndFind();
  testMetricDelta();
  testCheckinDelta();
  console.log('[OK] productivity tests passed');
}

run();
