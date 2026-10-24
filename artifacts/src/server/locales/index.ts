import type { Locale } from '../../shared/locale';
import { translator } from '../../shared/messages';
import en from './en.json';
import zh from './zh.json';

export const serverText = (locale: Locale) => translator({ en, zh }, locale);
