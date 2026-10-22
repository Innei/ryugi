import type { CommentsFile, HumanOp } from '../../shared/comments';
import { DOCUMENT_FEATURES, DOCUMENT_FEATURES_HEADER } from '../../shared/document-features';
import type { RelayPresence } from '../../shared/relay';
import type { DocumentPayload } from '../../shared/types';
import { createChannel, type Channel } from './channel';
import { createRelayConnection, type RelayConnection, type RelayConnectionOptions } from './relayConnection';

export interface DocumentMeta extends DocumentPayload {
  contentBase: string;
}

export interface DocumentState {
  snapshot: string;
  lineage: string;
  cursor: { id: string; offset: number } | null;
  streaming?: boolean;
  agentActiveAt?: number;
  now?: number;
  comments?: CommentsFile;
}

export interface DocumentTransport {
  artifact: string;
  channel: Channel;
  meta(): Promise<DocumentMeta | null>;
  state(): Promise<DocumentState>;
  update(bytes: Uint8Array): Promise<void>;
  comment(op: HumanOp): Promise<CommentsFile>;
  send(message: unknown): void;
}

export const encodeBase64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

export function createLocalTransport({ id, channel, send }: { id: string; channel: Channel; send: (message: unknown) => void }): DocumentTransport {
  const post = (action: string, body: BodyInit, type: string) =>
    fetch(`/api/document/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': type, [DOCUMENT_FEATURES_HEADER]: DOCUMENT_FEATURES.join(',') },
      body,
    });
  return {
    artifact: `document/${id}`,
    channel,
    send,
    async meta() {
      const res = await fetch(`/api/artifacts/document/${id}`, { cache: 'no-store' });
      return res.ok ? ((await res.json()) as DocumentMeta) : null;
    },
    async state() {
      const res = await fetch(`/api/document/${id}/state`, { cache: 'no-store' });
      const state = (await res.json()) as Partial<DocumentState> & { error?: string };
      if (!res.ok || !state.snapshot) throw new Error(state.error ?? `load failed (${res.status})`);
      return state as DocumentState;
    },
    async update(bytes) {
      const res = await post('update', bytes as Uint8Array<ArrayBuffer>, 'application/octet-stream');
      if (!res.ok) throw new Error(`update failed (${res.status})`);
    },
    async comment(op) {
      const res = await post('comments', JSON.stringify(op), 'application/json');
      if (!res.ok) throw new Error(`comment failed (${res.status})`);
      return ((await res.json()) as { comments: CommentsFile }).comments;
    },
  };
}

export interface RelayTransportOptions {
  url: string;
  artifact: string;
  contentBase: string;
  WebSocket?: typeof WebSocket;
  retryMs?: number;
  onPresence: (presence: RelayPresence) => void;
  connect?: (options: RelayConnectionOptions) => RelayConnection;
}

export function createRelayTransport(options: RelayTransportOptions): DocumentTransport & { close(): void } {
  const channel = createChannel();
  const connection = (options.connect ?? createRelayConnection)({
    url: options.url,
    artifact: options.artifact,
    WebSocket: options.WebSocket,
    retryMs: options.retryMs,
    onPresence: options.onPresence,
    onEvent: (event) => channel.emit(event as never),
    onOnline: () => channel.emit({ type: 'open' }),
  });
  return {
    artifact: options.artifact,
    channel,
    close: connection.close,
    async meta() {
      const meta = await connection.request<DocumentMeta>({ op: 'meta' });
      return /^https?:\/\//.test(meta.contentBase ?? '') ? meta : { ...meta, contentBase: options.contentBase };
    },
    state: () => connection.request<DocumentState>({ op: 'state' }),
    async update(bytes) {
      await connection.request({ op: 'update', bytes: encodeBase64(bytes), features: DOCUMENT_FEATURES });
    },
    async comment(op) {
      return (await connection.request<{ comments: CommentsFile }>({ op: 'comment', comment: op })).comments;
    },
    send(message) {
      const { type } = message as { type?: unknown };
      if (type === 'selection') connection.request({ op: 'selection', selection: message as never }).catch(() => {});
      else if (type === 'loaded' || type === 'runtime-error') connection.request({ op: 'client', message }).catch(() => {});
    },
  };
}
