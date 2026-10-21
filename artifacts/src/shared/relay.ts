import type { HumanOp } from './comments';
import type { DocumentSelectionMessage } from './selection';

export type RelayRequest =
  | { op: 'meta' }
  | { op: 'state' }
  | { op: 'update'; bytes: string }
  | { op: 'comment'; comment: HumanOp }
  | { op: 'selection'; selection: DocumentSelectionMessage }
  | { op: 'file'; path: string }
  | { op: 'client'; message: unknown };

export type RelayReply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type LiveHost = { hostId: string; port: number; key: string };

export type RelayPresence = { online: boolean; version: string | null; hosts?: LiveHost[] };
