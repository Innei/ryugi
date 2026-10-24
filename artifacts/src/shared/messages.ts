import type { Locale } from './locale';

export interface Dictionary {
  [key: string]: string | Dictionary;
}

function lookup(dictionary: Dictionary | undefined, key: string): string | undefined {
  let node: string | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

export function translator(dictionaries: Partial<Record<Locale, Dictionary>> & { en: Dictionary }, locale: Locale) {
  return (key: string, values: Record<string, string | number> = {}) => {
    const message = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key;
    return message.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };
}
