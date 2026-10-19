import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import type { LexicalEditor } from 'lexical';

export const createDocumentHeadlessEditor = (): LexicalEditor =>
  createHeadlessEditor({
    nodes: allHeadlessNodes,
    onError: (err) => {
      throw err;
    },
  });
