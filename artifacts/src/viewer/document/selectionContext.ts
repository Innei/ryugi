import { DOCUMENT_SELECTION_LIMITS } from '../../shared/selection';

export interface BlockSummary {
  id: string;
  heading: boolean;
  text: string;
}

export function selectionContext(blocks: BlockSummary[], from: number, to: number): { blockIds: string[]; heading: string } {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const blockIds = blocks
    .slice(start, end + 1)
    .flatMap((block) => (block.id ? [block.id] : []))
    .slice(0, DOCUMENT_SELECTION_LIMITS.blockIds);
  const heading = blocks.slice(0, start + 1).filter((block) => block.heading).pop()?.text ?? '';
  return { blockIds, heading };
}
