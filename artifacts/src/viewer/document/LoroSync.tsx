import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot, $isElementNode, type NodeKey } from 'lexical';
import type { LoroDoc, TreeID, VersionVector } from 'loro-crdt';
import { useEffect } from 'react';
import { sectionLabel } from '../lib/section';
import type { Channel } from './channel';

export interface AgentCaretPosition {
  key: NodeKey;
  offset: number;
}

interface Props {
  id: string;
  doc: LoroDoc;
  channel: Channel;
  onAgentCaret: (caret: AgentCaretPosition | null, section: string | null) => void;
  onOffline: (offline: boolean) => void;
}

const BATCH_MS = 100;

export const decodeBase64 = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export function LoroSync({ id, doc, channel, onAgentCaret, onOffline }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const binding = createLoroBinding(editor, doc, { commitMessage: 'human' });
    let sent: VersionVector | undefined = doc.oplogVersion();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let caret: { id: string; offset: number } | null = null;

    const showCaret = () => {
      const key = caret ? binding.keyOf(caret.id as TreeID) : undefined;
      if (!caret || !key) {
        onAgentCaret(null, null);
        return;
      }
      const section = editor.getEditorState().read(() => {
        const top = $getNodeByKey(key)?.getTopLevelElement();
        const blocks = $getRoot()
          .getChildren()
          .map((block) => ({ heading: block.getType() === 'heading', text: $isElementNode(block) ? block.getTextContent() : '' }));
        return top ? sectionLabel(blocks, top.getIndexWithinParent()) : null;
      });
      onAgentCaret({ key, offset: caret.offset }, section);
    };

    const send = async () => {
      timer = undefined;
      if (inFlight) {
        timer = setTimeout(send, BATCH_MS);
        return;
      }
      const from = sent;
      const bytes = doc.export({ mode: 'update', from });
      sent = doc.oplogVersion();
      inFlight = true;
      try {
        const res = await fetch(`/api/document/${id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: bytes as Uint8Array<ArrayBuffer>,
        });
        if (!res.ok) throw new Error(`update failed (${res.status})`);
        onOffline(false);
      } catch {
        sent = from;
        onOffline(true);
      } finally {
        inFlight = false;
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(send, BATCH_MS);
    };
    const unsubscribeLocal = doc.subscribeLocalUpdates(schedule);

    const resync = async (resend: boolean) => {
      try {
        const res = await fetch(`/api/document/${id}/state`, { cache: 'no-store' });
        const state = (await res.json()) as { snapshot: string; lineage: string; cursor: typeof caret };
        if (state.lineage !== doc.getTree(TREE_NAME).roots()[0]?.id) {
          location.reload();
          return;
        }
        binding.import(decodeBase64(state.snapshot));
        caret = state.cursor;
        showCaret();
        if (resend) {
          sent = undefined;
          schedule();
        }
      } catch {
        onOffline(true);
      }
    };

    const artifact = `document/${id}`;
    const unsubscribeChannel = channel.subscribe((event) => {
      if (event.type === 'open') void resync(true);
      else if (event.type === 'doc-update' && event.artifact === artifact) binding.import(decodeBase64(event.bytes));
      else if (event.type === 'doc-cursor' && event.artifact === artifact) {
        caret = event.cursor;
        showCaret();
      }
    });

    // The socket may have opened, and updates may have arrived, before this mounted.
    void resync(false);

    return () => {
      clearTimeout(timer);
      unsubscribeChannel();
      unsubscribeLocal();
      binding.dispose();
    };
  }, [editor, doc, id, channel, onAgentCaret, onOffline]);

  return null;
}
