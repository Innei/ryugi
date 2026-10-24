const DAY = 86_400_000;
const pad = (value: number) => String(value).padStart(2, '0');
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function historyDay(seconds: number, now = Date.now()): string {
  if (!(seconds > 0)) return '时间未记录';
  const date = new Date(seconds * 1000);
  const today = new Date(now);
  const days = Math.round((midnight(today) - midnight(date)) / DAY);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  const day = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === today.getFullYear() ? day : `${date.getFullYear()}年${day}`;
}

export function historyClock(seconds: number, withSeconds = false): string {
  if (!(seconds > 0)) return '--:--';
  const date = new Date(seconds * 1000);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${clock}:${pad(date.getSeconds())}` : clock;
}

export function historyWhen(seconds: number): string {
  return seconds > 0 ? `${historyDay(seconds)} ${historyClock(seconds)}` : '时间未记录';
}
