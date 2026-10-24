import { i18n } from '../i18n';

export function errorText(code: unknown, fallback: string): string {
  return typeof code === 'string' && i18n.exists(`errors.${code}`) ? i18n.t(`errors.${code}`) : fallback;
}
