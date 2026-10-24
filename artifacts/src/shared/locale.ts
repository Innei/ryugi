export type Locale = 'en' | 'zh';

export const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-CN' };

export function resolveLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const primary = preference.split('-')[0]?.trim().toLowerCase();
    if (primary === 'zh') return 'zh';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag);
}
