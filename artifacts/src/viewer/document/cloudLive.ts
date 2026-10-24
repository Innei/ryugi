import { i18n } from '../i18n';

const minorOf = (version: string | null) => /^(\d+)\.(\d+)\./.exec(version ?? '')?.slice(1, 3).join('.') ?? null;

export function editableAcross(viewer: string, host: string | null) {
  const mine = minorOf(viewer);
  return mine !== null && mine === minorOf(host);
}

export const versionReason = (viewer: string, host: string | null) =>
  i18n.t('document.versionReason', { host: host ?? i18n.t('document.unknownVersion'), viewer });
