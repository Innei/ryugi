import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import type { ServerMessage } from '../src/shared/types';
import { createDocumentRegistry } from '../src/server/documents';

test('a list that picks up an agent file write still pushes it to the page', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-registry-'));
  const file = path.join(root, 'document', 'relay', 'comments.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sent: ServerMessage[] = [];
  const registry = createDocumentRegistry({
    root,
    stateDir: path.join(root, '.state'),
    broadcast: (m) => sent.push(m),
    onWarningsChange: () => {},
  });
  registry.comments('relay');
  fs.writeFileSync(
    file,
    JSON.stringify({
      threads: [
        { anchor: { blockId: 'b1', quote: '' }, messages: [{ author: 'agent', text: 'q' }] },
      ],
    }),
  );
  registry.listComments('relay', 'Codex', true);
  registry.commentsChanged('relay');
  expect(sent.filter((m) => m.type === 'doc-comments')).toHaveLength(1);
});
