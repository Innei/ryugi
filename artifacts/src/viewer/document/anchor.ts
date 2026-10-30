import { type Anchor, anchorBlockIds } from '../../shared/comments';
import { t } from '../i18n';

export function anchorLabel(anchor: Anchor): string {
  if (anchor.quote) return anchor.quote;
  const count = anchorBlockIds(anchor).length;
  return count > 1 ? t('document.wholeBlocks', { count }) : t('document.wholeBlock');
}

export function resolveAnchor(
  blockText: string,
  quote: string,
  preferredStart?: number,
): { start: number; end: number } | 'block' {
  if (!quote) return 'block';
  const start =
    preferredStart !== undefined &&
    blockText.slice(preferredStart, preferredStart + quote.length) === quote
      ? preferredStart
      : blockText.indexOf(quote);
  return start === -1 ? 'block' : { start, end: start + quote.length };
}

export function shownThreadIds(
  threads: { id: string; status: 'open' | 'resolved' }[],
  activeId: string | null,
): Set<string> {
  return new Set(
    threads
      .filter((thread) => thread.status === 'open' || thread.id === activeId)
      .map((thread) => thread.id),
  );
}
