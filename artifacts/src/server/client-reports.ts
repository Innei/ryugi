import type { Duplex } from 'node:stream';

import type { ServerMessage } from '../shared/types';
import { artifactKeyOf, resolveArtifactDir } from './artifacts';
import type { ServerContext } from './context';
import { readHtml } from './html';
import { MAX_RUNTIME_WARNINGS } from './limits';
import { textFrame } from './ws';

const MAX_RUNTIME_MESSAGE = 2048;

export function onClientText(ctx: ServerContext, socket: Duplex, text: string) {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (typeof message !== 'object' || message === null) return;
  if ((message as { type?: unknown }).type === 'selection') {
    ctx.selections.accept(socket, message);
    return;
  }
  acceptReport(ctx, message as Record<string, unknown>);
}

export function acceptReport(
  ctx: ServerContext,
  { type, artifact, message: detail, version, file }: Record<string, unknown>,
) {
  const { root, dynamicBlocks, runtimeWarnings, ranVersions, clients } = ctx;
  if (typeof artifact !== 'string') return;
  const ref = artifactKeyOf(artifact);
  if (!ref || ref.type === 'artboard' || artifact !== `${ref.type}/${ref.id}`) return;
  const dir = resolveArtifactDir(root, ref.type, ref.id);
  if (!dir) return;
  if (ref.type === 'document') {
    if (!dynamicBlocks.accepts(file)) return;
    if (type === 'loaded') {
      if (dynamicBlocks.loaded(ref.id, dir, file)) ctx.writeState(ref, dir);
      return;
    }
    if (type !== 'runtime-error' || typeof detail !== 'string') return;
    if (detail.length === 0 || detail.length > MAX_RUNTIME_MESSAGE) return;
    if (!dynamicBlocks.report(ref.id, dir, file, detail)) return;
    ctx.writeState(ref, dir);
    ctx.broadcast({ type: 'change', artifact, files: [] });
    return;
  }
  if (type === 'loaded') {
    if (typeof version !== 'number' || version !== readHtml(dir, ref.id).version) return;
    ranVersions.set(artifact, version);
    ctx.writeState(ref, dir);
    return;
  }
  if (type !== 'runtime-error' || typeof detail !== 'string') return;
  if (detail.length === 0 || detail.length > MAX_RUNTIME_MESSAGE) return;
  const list = runtimeWarnings.get(artifact) ?? [];
  if (list.includes(detail) || list.length >= MAX_RUNTIME_WARNINGS) return;
  runtimeWarnings.set(artifact, [...list, detail]);
  ctx.writeState(ref, dir);
  const frame = textFrame(
    JSON.stringify({ type: 'change', artifact, files: [] } satisfies ServerMessage),
  );
  for (const socket of clients) socket.write(frame);
}
