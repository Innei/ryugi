import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveLocale } from '../../shared/locale';
import en from './locales/en.json';
import zh from './locales/zh.json';

export { Trans, useTranslation } from 'react-i18next';

function browserPreferences(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
}

function init(instance: I18n, preferences: readonly string[]) {
  void instance.init({
    lng: resolveLocale(preferences),
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    resources: { en: { translation: en }, zh: { translation: zh } },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

export function createViewerI18n(preferences: readonly string[]) {
  return init(i18next.createInstance(), preferences);
}

export const i18n = init(i18next.createInstance().use(initReactI18next), browserPreferences());
export const t = i18n.t.bind(i18n);
