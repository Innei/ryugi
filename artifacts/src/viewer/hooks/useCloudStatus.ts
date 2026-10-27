import { useCallback, useEffect, useRef, useState } from 'react';

import type { CloudStatus } from '../../shared/cloud';
import { onServerMessage } from './useArtifactSocket';

export interface CloudResult {
  json: Record<string, unknown>;
  ok: boolean;
  status: number;
}

const LOGIN_POLL_MS = 2000;
const LOGIN_POLL_LIMIT_MS = 5 * 60 * 1000;

export async function cloudRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<CloudResult> {
  try {
    const res = await fetch(`/api/cloud/${path}`, {
      method,
      cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: { error: (err as Error).message } };
  }
}

export function useCloudStatus() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [waitingForLogin, setWaitingForLogin] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const result = await cloudRequest('GET', 'status');
    if (result.ok) setStatus(result.json as unknown as CloudStatus);
    return result.ok ? (result.json as unknown as CloudStatus) : null;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setWaitingForLogin(false);
  }, []);

  const login = useCallback(
    async (loginUrl?: string) => {
      const url =
        loginUrl ?? ((await cloudRequest('POST', 'login')).json.url as string | undefined);
      if (!url) return;
      window.open(url, '_blank', 'noopener');
      stopPolling();
      setWaitingForLogin(true);
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        const next = await refresh();
        if (next?.signedIn || Date.now() - startedAt > LOGIN_POLL_LIMIT_MS) stopPolling();
      }, LOGIN_POLL_MS);
    },
    [refresh, stopPolling],
  );

  useEffect(() => {
    void refresh();
    const unsubscribe = onServerMessage((message) => {
      if (message.type === 'cloud-publication' || message.type === 'cloud-published')
        void refresh();
    });
    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [refresh, stopPolling]);

  return { status, refresh, login, waitingForLogin };
}
