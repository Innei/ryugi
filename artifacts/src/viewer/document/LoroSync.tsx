import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LoroDoc, VersionVector } from 'loro-crdt';
import { useEffect } from 'react';

import type { DocumentState, DocumentTransport } from './transport';

interface Props {
  doc: LoroDoc;
  onOffline: (offline: boolean) => void;
  onState?: (state: DocumentState) => void;
  transport: DocumentTransport;
}

const BATCH_MS = 100;
const RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export const decodeBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export function LoroSync({ transport, doc, onOffline, onState }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const binding = createLoroBinding(editor, doc, { commitMessage: 'human' });
    let sent: VersionVector | undefined = doc.oplogVersion();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = RETRY_MS;
    let inFlight = false;
    let syncing = false;
    let needsSend = false;
    let generation = 0;
    let disposed = false;
    const current = (run: number) => !disposed && run === generation;

    const retrySync = () => {
      clearTimeout(timer);
      if (retry !== undefined) return;
      retry = setTimeout(() => {
        retry = undefined;
        void resync(true);
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
    };

    const send = async () => {
      timer = undefined;
      if (disposed || syncing || inFlight || retry !== undefined) return;
      const run = generation;
      const bytes = doc.export({ mode: 'update', from: sent });
      const to = doc.oplogVersion();
      needsSend = false;
      inFlight = true;
      try {
        await transport.update(bytes);
        if (!current(run)) return;
        // Advance only to the acknowledged version; edits made during the request still need sending.
        sent = to;
        retryDelay = RETRY_MS;
        onOffline(false);
      } catch {
        if (!current(run)) return;
        onOffline(true);
        retrySync();
      } finally {
        if (current(run)) {
          inFlight = false;
          if (needsSend) schedule();
        }
      }
    };
    const schedule = () => {
      needsSend = true;
      if (disposed || syncing || inFlight || retry !== undefined) return;
      clearTimeout(timer);
      timer = setTimeout(send, BATCH_MS);
    };
    const unsubscribeLocal = doc.subscribeLocalUpdates(schedule);

    async function resync(resend: boolean) {
      if (disposed) return;
      const run = ++generation;
      clearTimeout(timer);
      clearTimeout(retry);
      retry = undefined;
      // A replacement connection must not wait for a request on the old connection.
      inFlight = false;
      syncing = true;
      try {
        const state = await transport.state();
        if (!current(run)) return;
        if (state.lineage !== doc.getTree(TREE_NAME).roots()[0]?.id) {
          location.reload();
          return;
        }
        binding.import(decodeBase64(state.snapshot));
        onState?.(state);
        if (resend) {
          sent = undefined;
          needsSend = true;
        }
        syncing = false;
        if (needsSend) schedule();
      } catch {
        if (!current(run)) return;
        syncing = false;
        onOffline(true);
        retrySync();
      }
    }

    const { artifact } = transport;
    const unsubscribeChannel = transport.channel.subscribe((event) => {
      if (event.type === 'open') {
        retryDelay = RETRY_MS;
        void resync(true);
      } else if (event.type === 'doc-update' && event.artifact === artifact)
        binding.import(decodeBase64(event.bytes));
    });

    // The socket may have opened, and updates may have arrived, before this mounted.
    void resync(false);

    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(retry);
      unsubscribeChannel();
      unsubscribeLocal();
      binding.dispose();
    };
  }, [editor, doc, transport, onOffline, onState]);

  return null;
}
