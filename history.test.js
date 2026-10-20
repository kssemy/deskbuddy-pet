const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workMinutesForDay, tasksForDay } = require('./history');

test('calendar counts scheduled work and overtime until app closes', () => {
  const day = new Date(2026, 9, 20);
  const time = (hour, minute = 0) => new Date(2026, 9, 20, hour, minute).getTime();
  const settings = { workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
  assert.equal(workMinutesForDay(day, [], settings), 0);
  assert.equal(workMinutesForDay(day, [{ startedAt: time(8), endedAt: time(17) }], settings), 480);
  assert.equal(workMinutesForDay(day, [{ startedAt: time(8), endedAt: time(19, 30) }], settings), 570);
});

test('unfinished tasks carry forward, pinned tasks stay, and deleted work stays in history', () => {
  const tasks = [
    { text: '진행 중', day: '2026-10-20', completedAt: '' },
    { text: '고정 완료', day: '2026-10-20', completedAt: '2026-10-21', pinned: true }
  ];
  const archive = [{ text: '완료 후 삭제', day: '2026-10-20', completedAt: '2026-10-21', removedAt: '2026-10-22' }];
  assert.deepEqual(tasksForDay('2026-10-20', tasks, archive, '2026-10-22').map(task => task.done), [false, false, false]);
  assert.deepEqual(tasksForDay('2026-10-21', tasks, archive, '2026-10-22').map(task => task.done), [false, true, true]);
  assert.deepEqual(tasksForDay('2026-10-22', tasks, archive, '2026-10-22').map(task => task.text), ['진행 중', '고정 완료']);
  assert.equal(tasksForDay('2026-10-23', tasks, archive, '2026-10-22').length, 0);
});
