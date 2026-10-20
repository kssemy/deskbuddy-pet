function atTime(day, value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
}

function workMinutesForDay(day, sessions, settings) {
  const start = atTime(day, settings.workStart);
  const end = atTime(day, settings.workEnd);
  const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const active = sessions.filter(session => Number(session.startedAt) < nextDay &&
    Number(session.endedAt || session.lastSeenAt) >= start);
  if (!active.length) return 0;
  const lunch = Math.max(0, Math.min(end, atTime(day, settings.lunchEnd)) - Math.max(start, atTime(day, settings.lunchStart)));
  const regular = Math.max(0, end - start - lunch);
  const lastOff = Math.max(...active.map(session => Number(session.endedAt || session.lastSeenAt)));
  const overtime = Math.max(0, Math.min(lastOff, nextDay) - end);
  return Math.floor((regular + overtime) / 60000);
}

function tasksForDay(key, tasks, archive, currentDay) {
  if (key > currentDay) return [];
  return [...tasks, ...archive]
    .filter(task => task.day <= key && (!task.removedAt || task.removedAt >= key) &&
      (task.pinned && !task.removedAt || !task.completedAt || task.completedAt >= key))
    .map(task => ({ text: task.text, done: !!task.completedAt && task.completedAt <= key, pinned: !!task.pinned }));
}

module.exports = { workMinutesForDay, tasksForDay };
