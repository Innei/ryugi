import { readArtifactFile } from './artifact-file';
import { artifactKeyOf, resolveArtifactDir } from './artifacts';
import { asBoardHumanOp } from './board-comments';
import { acceptReport } from './client-reports';
import type { ServerContext } from './context';
import { asHumanOp } from './document-comments';
import { MAX_COMMENT_OP, MAX_DOCUMENT_UPDATE } from './limits';
import { CLOUD_RUNTIME_URL } from './publish-payload';

const MAX_RELAY_FILE = 8 * 1024 * 1024;

export function dropRelayViewer(ctx: ServerContext, conn: string) {
  const viewer = ctx.relayViewers.get(conn);
  if (!viewer) return;
  ctx.selections.drop(viewer.tab);
  ctx.relayViewers.delete(conn);
}

export function relayWatch(ctx: ServerContext, keys: Set<string>) {
  for (const [conn, viewer] of ctx.relayViewers) {
    if (keys.has(viewer.key) || conn.startsWith('direct:')) continue;
    ctx.selections.drop(viewer.tab);
    ctx.relayViewers.delete(conn);
  }
}

export async function handleRelay(
  ctx: ServerContext,
  key: string,
  body: unknown,
  conn: string,
  contentOrigin = '',
) {
  const { root, recordings, boardComments, documents, selections, relayViewers } = ctx;
  const ref = artifactKeyOf(key)!;
  const dir = resolveArtifactDir(root, ref.type, ref.id);
  if (!dir) throw new Error(`${key} not found`);
  const request = (typeof body === 'object' && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  if (request.op === 'publication' && ctx.cloud) return ctx.cloud.publication(key);
  if (request.op === 'publish' && ctx.cloud) return ctx.cloud.publishNow(key);
  if (request.op === 'meta') return ctx.artifactMeta(ref, dir, contentOrigin);
  if (request.op === 'file') {
    const file =
      typeof request.path === 'string'
        ? readArtifactFile(
            dir,
            ref.type,
            request.path,
            CLOUD_RUNTIME_URL,
            MAX_RELAY_FILE,
            ref.type === 'artboard' ? recordings.resolve(ref.id, request.path) : null,
          )
        : null;
    if (!file) throw new Error('not found');
    if (file.data.length > MAX_RELAY_FILE) throw new Error('too large');
    return { contentType: file.contentType, data: file.data.toString('base64') };
  }
  if (request.op === 'client') {
    if (typeof request.message === 'object' && request.message !== null)
      acceptReport(ctx, { ...(request.message as Record<string, unknown>), artifact: key });
    return null;
  }
  if (request.op === 'comment' && ref.type === 'artboard') {
    const op =
      JSON.stringify(request.comment ?? null).length <= MAX_COMMENT_OP
        ? asBoardHumanOp(request.comment)
        : null;
    if (!op) throw new Error('not a comment op');
    if (ctx.verdictPreparing(ref.id, op))
      throw new Error('The recording evidence is still being prepared');
    return boardComments.apply(ref.id, op);
  }
  if (
    (request.op === 'state' || request.op === 'update' || request.op === 'comment') &&
    ref.type !== 'document'
  )
    throw new Error(`${key} is not a document`);
  if (request.op === 'state' || request.op === 'update') {
    const session = await documents.open(ref.id);
    if (!session) throw new Error(`${key} has no doc.xml`);
    if (request.op === 'state') return ctx.documentState(ref.id, session);
    const bytes = typeof request.bytes === 'string' ? Buffer.from(request.bytes, 'base64') : null;
    if (!bytes) throw new Error('update needs bytes');
    if (bytes.length > MAX_DOCUMENT_UPDATE) throw new Error('update too large');
    const features = Array.isArray(request.features)
      ? request.features.filter((feature): feature is string => typeof feature === 'string')
      : [];
    session.importUpdate(new Uint8Array(bytes), features);
    return null;
  }
  if (request.op === 'comment') {
    const op =
      JSON.stringify(request.comment ?? null).length <= MAX_COMMENT_OP
        ? asHumanOp(request.comment)
        : null;
    if (!op) throw new Error('not a comment op');
    return { comments: documents.applyCommentOp(ref.id, op) };
  }
  if (request.op === 'selection') {
    if (typeof request.selection !== 'object' || request.selection === null)
      throw new Error('not a selection');
    const viewer = relayViewers.get(conn) ?? { key, tab: {} };
    relayViewers.set(conn, viewer);
    selections.accept(viewer.tab, { ...request.selection, artifact: key });
    return null;
  }
  throw new Error('unknown request');
}
