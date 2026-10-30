import { blockIdState } from '@haklex/rich-editor';
import { $getRoot, $getState, type LexicalEditor } from 'lexical';

import type { TextRangeAnchor } from '../../shared/comments';

export function $getSelectedTextRanges(editor: LexicalEditor, range: Range): TextRangeAnchor[] {
  return $getRoot()
    .getChildren()
    .flatMap((block) => {
      const blockId = $getState(block, blockIdState);
      const element = editor.getElementByKey(block.getKey());
      if (!blockId || !element || !range.intersectsNode(element)) return [];
      const part = document.createRange();
      part.selectNodeContents(element);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
        part.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0)
        part.setEnd(range.endContainer, range.endOffset);
      if (part.collapsed) return [];
      const quote = part.toString();
      if (!quote && element.textContent) return [];
      const prefix = document.createRange();
      prefix.selectNodeContents(element);
      prefix.setEnd(part.startContainer, part.startOffset);
      return [{ blockId, quote, start: prefix.toString().length }];
    });
}
