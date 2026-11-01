const unit = (language: string, name: 'day' | 'hour' | 'minute', value: number) =>
  new Intl.NumberFormat(language, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(
    value,
  );

export function formatUptime(ms: number, language: string) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${unit(language, 'day', days)} ${unit(language, 'hour', hours)}`;
  if (hours > 0)
    return `${unit(language, 'hour', hours)} ${unit(language, 'minute', minutes % 60)}`;
  return unit(language, 'minute', minutes);
}

export function addressOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function hubAction(path: string, init: RequestInit = { method: 'POST' }) {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(String(response.status));
}
