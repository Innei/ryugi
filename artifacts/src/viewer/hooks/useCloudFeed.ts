import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardHumanOp } from '../../shared/board-comments';
import type { RelayPresence } from '../../shared/relay';
import type { ArtifactType } from '../../shared/types';
import type { RelayConnection } from '../document/relayConnection';
import { boardCommentsFromMessage, type BoardCommentsState } from '../lib/board-comments';
import { knownHosts } from '../lib/knownHosts';
import { createLiveConnection } from '../lib/liveConnection';
import type { ArtifactFeed } from '../lib/feed';
import { connectPublication } from '../lib/cloud-publication';
import { reportCloudHeader, useCloudHeader } from './useCloudHeader';

const RENEW_BEFORE_MS = 60 * 60 * 1000;

const expiresAt = (base: string) => {
  const match = /\/live\/(\d+)\./.exec(base);
  return match ? Number(match[1]) * 1000 : Number.POSITIVE_INFINITY;
};

export const relayUrlFor = (cloudId: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/relay/a/${encodeURIComponent(cloudId)}`;

export function useCloudFeed(cloudId: string, type: ArtifactType, liveContentBase: string): { presence: RelayPresence | null; feed: ArtifactFeed } {
  const [presence, setPresence] = useState<RelayPresence | null>(null);
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState<RelayConnection | null>(null);
  const [boardComments, setBoardComments] = useState<BoardCommentsState | null>(null);
  const liveBase = useRef(liveContentBase);
  useCloudHeader(cloudId, { online: presence?.online ?? null });

  useEffect(() => {
    liveBase.current = liveContentBase;
  }, [liveContentBase]);

  const currentLiveBase = useCallback(async () => {
    if (expiresAt(liveBase.current) - Date.now() > RENEW_BEFORE_MS) return liveBase.current;
    try {
      const res = await fetch(`/api/a/${encodeURIComponent(cloudId)}`, { cache: 'no-store', credentials: 'same-origin' });
      const { liveContentBase: renewed } = (await res.json()) as { liveContentBase?: unknown };
      if (typeof renewed === 'string') liveBase.current = renewed;
    } catch {}
    return liveBase.current;
  }, [cloudId]);

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);
    const live = connectPublication(cloudId, {
      url: relayUrlFor(cloudId),
      artifact: `${type}/${cloudId}`,
      onPresence: setPresence,
      onEvent: (event) => {
        if ((event as { type?: unknown }).type === 'change') bump();
        const comments = boardCommentsFromMessage(event, null);
        if (comments) setBoardComments(comments);
      },
      onOnline: bump,
    }, (options) => createLiveConnection({ ...options, cloudId, known: knownHosts() }));
    setConnection(live);
    return () => {
      live.close();
      setConnection(null);
      setPresence(null);
    };
  }, [cloudId, type]);

  const load = useCallback(async () => {
    if (!connection) throw new Error('offline');
    const meta = await connection.request<Record<string, unknown>>({ op: 'meta' });
    const title = type === 'artboard' ? (meta.canvas as { title?: unknown } | null)?.title : meta.title;
    if (typeof title === 'string') reportCloudHeader(cloudId, { title });
    const own = typeof meta.contentBase === 'string' && /^https?:\/\//.test(meta.contentBase);
    return { found: true, data: { ...meta, contentBase: own ? meta.contentBase : await currentLiveBase() } };
  }, [connection, currentLiveBase, cloudId, type]);

  const send = useCallback(
    (message: unknown) => {
      if (!connection) return;
      const selection = (message as { type?: unknown }).type === 'selection';
      connection.request(selection ? { op: 'selection', selection: message as never } : { op: 'client', message }).catch(() => {});
    },
    [connection],
  );

  const comment = useCallback(
    async (op: BoardHumanOp) => {
      if (!connection) throw new Error('offline');
      const next = await connection.request<BoardCommentsState>({ op: 'comment', comment: op as never });
      setBoardComments(next);
      return next;
    },
    [connection],
  );

  return { presence, feed: { live: presence?.online ?? false, revision, load, send, ...(type === 'artboard' ? { boardComments, comment } : {}) } };
}
