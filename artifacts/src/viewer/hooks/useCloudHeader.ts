import { useEffect } from 'react';

export interface CloudHeaderState {
  title?: string;
  online?: boolean | null;
  comments?: number;
  activity?: string | null;
  retrying?: boolean;
  reason?: string | null;
}

export function reportCloudHeader(id: string, state: CloudHeaderState) {
  if (window.parent !== window) window.parent.postMessage({ type: 'ryugi:cloud-header', id, ...state }, location.origin);
}

export function useCloudHeader(id: string, state: CloudHeaderState | null) {
  const enabled = state !== null;
  const { title, online, comments, activity, retrying, reason } = state ?? {};
  useEffect(() => {
    if (enabled) reportCloudHeader(id, { title, online, comments, activity, retrying, reason });
  }, [id, enabled, title, online, comments, activity, retrying, reason]);
  return enabled && window.parent !== window;
}

export function readCloudHeader(data: unknown, id: string): CloudHeaderState | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.type !== 'ryugi:cloud-header' || message.id !== id) return null;
  const state: CloudHeaderState = {};
  if (typeof message.title === 'string') state.title = message.title;
  if (typeof message.online === 'boolean' || message.online === null) state.online = message.online;
  if (typeof message.comments === 'number' && Number.isSafeInteger(message.comments) && message.comments >= 0) state.comments = message.comments;
  if (typeof message.activity === 'string' || message.activity === null) state.activity = message.activity;
  if (typeof message.retrying === 'boolean') state.retrying = message.retrying;
  if (typeof message.reason === 'string' || message.reason === null) state.reason = message.reason;
  return state;
}
