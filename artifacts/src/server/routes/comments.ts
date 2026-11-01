import type http from 'node:http';

import { resolveArtifactDir } from '../artifacts';
import { asBoardHumanOp } from '../board-comments';
import type { ServerContext } from '../context';
import { sendJson } from '../http';
import { MAX_COMMENT_OP } from '../limits';
import type { HttpRoute } from './table';

const API_BOARD_COMMENTS_ROUTE = /^\/api\/artboard\/([^/]+)\/comments$/;

export const readCommentBody = async (req: http.IncomingMessage): Promise<unknown> => {
  const parts: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += (chunk as Buffer).length;
    if (received <= MAX_COMMENT_OP) parts.push(chunk as Buffer);
  }
  if (received > MAX_COMMENT_OP) return null;
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    return null;
  }
};

async function serveBoardComments(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
  id: string,
) {
  if (!resolveArtifactDir(ctx.root, 'artboard', id)) {
    sendJson(res, 404, { error: `artboard/${id} not found` });
    return;
  }
  const op = asBoardHumanOp(await readCommentBody(req));
  if (!op) {
    sendJson(res, 400, { error: 'not a comment op' });
    return;
  }
  if (ctx.verdictPreparing(id, op)) {
    sendJson(res, 409, { error: 'The recording evidence is still being prepared' });
    return;
  }
  try {
    sendJson(res, 200, ctx.boardComments.apply(id, op));
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
  }
}

export const boardCommentsRoute: HttpRoute<ServerContext> = {
  path: API_BOARD_COMMENTS_ROUTE,
  methods: ['POST'],
  auth: 'same-origin',
  handle: (req, res, ctx, { match }) => serveBoardComments(req, res, ctx, match[1]!),
};
