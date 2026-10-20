const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workState } = require('./worktime');

test('schedule timer ignores app sessions and hides time during lunch', () => {
  const on = time => new Date('2026-10-20T' + time + ':00');
  const settings = { workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
  const sessions = [
    { startedAt: on('09:00').getTime(), endedAt: on('12:00').getTime() },
    { startedAt: on('13:00').getTime(), lastSeenAt: on('18:30').getTime() }
  ];
  assert.equal(workState(on('09:30'), settings, sessions), '00:30');
  assert.equal(workState(on('12:30'), settings, sessions), '점심 먹는 중');
  assert.equal(workState(on('13:30'), settings, sessions), '03:30');
  assert.equal(workState(on('18:30'), settings, sessions), '야근 00:30');
});
