export interface SectionBlock {
  heading: boolean;
  text: string;
}

const NUMBERED = /^\s*(\d+(?:\.\d+)*)[.、)\s]/;

export function sectionLabel(blocks: SectionBlock[], index: number): string | null {
  for (let i = Math.min(index, blocks.length - 1); i >= 0; i--) {
    const block = blocks[i]!;
    if (!block.heading) continue;
    const number = NUMBERED.exec(block.text)?.[1];
    return number ? `§${number}` : `「${block.text.trim()}」`;
  }
  return null;
}
