import { HTML_LANG, type Locale } from '../../shared/locale';
import { i18n } from '../i18n';

const DAY = 86_400_000;
const pad = (value: number) => String(value).padStart(2, '0');
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function historyDay(seconds: number, now = Date.now()): string {
  if (!(seconds > 0)) return i18n.t('time.notRecorded');
  const date = new Date(seconds * 1000);
  const today = new Date(now);
  const days = Math.round((midnight(today) - midnight(date)) / DAY);
  if (days === 0) return i18n.t('time.today');
  if (days === 1) return i18n.t('time.yesterday');
  const sameYear = date.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(HTML_LANG[i18n.language as Locale], sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

export function historyClock(seconds: number, withSeconds = false): string {
  if (!(seconds > 0)) return '--:--';
  const date = new Date(seconds * 1000);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${clock}:${pad(date.getSeconds())}` : clock;
}

export function historyWhen(seconds: number): string {
  return seconds > 0 ? `${historyDay(seconds)} ${historyClock(seconds)}` : i18n.t('time.notRecorded');
}
