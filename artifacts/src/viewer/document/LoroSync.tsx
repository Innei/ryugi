import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot, $isElementNode, type NodeKey } from 'lexical';
import type { LoroDoc, TreeID, VersionVector } from 'loro-crdt';
import { useEffect } from 'react';
import { sectionLabel } from '../lib/section';
import type { DocumentState, DocumentTransport } from './transport';

export interface AgentCaretPosition {
  key: NodeKey;
  offset: number;
}

interface Props {
  transport: DocumentTransport;
  doc: LoroDoc;
  onAgentCaret: (caret: AgentCaretPosition | null, section: string | null) => void;
  onOffline: (offline: boolean) => void;
  onState?: (state: DocumentState) => void;
}

const BATCH_MS = 100;

export const decodeBase64 = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export function LoroSync({ transport, doc, onAgentCaret, onOffline, onState }: Props) {
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
        await transport.update(bytes);
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
        const state = await transport.state();
        if (state.lineage !== doc.getTree(TREE_NAME).roots()[0]?.id) {
          location.reload();
          return;
        }
        binding.import(decodeBase64(state.snapshot));
        caret = state.cursor;
        showCaret();
        onState?.(state);
        if (resend) {
          sent = undefined;
          schedule();
        }
      } catch {
        onOffline(true);
      }
    };

    const { artifact } = transport;
    const unsubscribeChannel = transport.channel.subscribe((event) => {
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
  }, [editor, doc, transport, onAgentCaret, onOffline, onState]);

  return null;
}
