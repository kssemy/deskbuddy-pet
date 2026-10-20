function atTime(day, time) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
}
function workState(now, settings) {
  const start = atTime(now, settings.workStart);
  const end = atTime(now, settings.workEnd);
  const lunchStart = atTime(now, settings.lunchStart);
  const lunchEnd = atTime(now, settings.lunchEnd);
  const format = ms => {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  };
  const current = now.getTime();
  if (current < start) return '출근 전';
  if (current >= end) return '야근 ' + format(current - end);
  if (current >= lunchStart && current < lunchEnd) return '점심 먹는 중';
  const lunchElapsed = Math.max(0, Math.min(current, lunchEnd, end) - Math.max(start, lunchStart));
  return format(current - start - lunchElapsed);
}
module.exports = { workState };
