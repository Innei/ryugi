import type { TextRangeAnchor } from '../../shared/comments';

export const draftKey = (
  blockId: string,
  quote: string,
  blockIds?: string[],
  textRanges?: TextRangeAnchor[],
) => `${JSON.stringify([blockIds ?? [blockId], textRanges ?? null])}\n${quote}`;

export function createDrafts() {
  const texts = new Map<string, string>();
  return {
    save(key: string, text: string) {
      if (text.trim()) texts.set(key, text);
      else texts.delete(key);
    },
    take(key: string) {
      return texts.get(key) ?? '';
    },
  };
}
