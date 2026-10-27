import type { Locale } from './locale';

export interface Dictionary {
  [key: string]: string | Dictionary;
}

function lookup(dictionary: Dictionary | undefined, key: string): string | undefined {
  let node: string | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

function find(
  dictionary: Dictionary | undefined,
  key: string,
  locale: Locale,
  count: unknown,
): string | undefined {
  if (typeof count === 'number') {
    const form =
      lookup(dictionary, `${key}_${new Intl.PluralRules(locale).select(count)}`) ??
      lookup(dictionary, `${key}_other`);
    if (form !== undefined) return form;
  }
  return lookup(dictionary, key);
}

export function translator(
  dictionaries: Partial<Record<Locale, Dictionary>> & { en: Dictionary },
  locale: Locale,
) {
  return (key: string, values: Record<string, string | number> = {}) => {
    const message =
      find(dictionaries[locale], key, locale, values.count) ??
      find(dictionaries.en, key, 'en', values.count) ??
      key;
    return message.replaceAll(/\{\{(\w+)\}\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}
