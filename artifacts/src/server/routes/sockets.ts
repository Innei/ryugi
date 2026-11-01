import { onClientText } from '../client-reports';
import type { ServerContext } from '../context';
import { completeHandshake, handleClientFrames, rejectUpgrade } from '../ws';
import type { UpgradeRoute } from './table';

const DIRECT_RELAY_ROUTE = /^\/relay\/a\/([\w-]{1,64})$/;

export const directRelayRoute: UpgradeRoute<ServerContext> = {
  path: DIRECT_RELAY_ROUTE,
  auth: 'direct-relay',
  handle: (_req, socket, ctx, { match, clientKey }) => {
    const key = ctx.servedArtifacts().get(match[1]!);
    if (!key) rejectUpgrade(socket, 404, 'Not Found');
    else ctx.direct.accept(socket, clientKey, key);
  },
};

export const clientSocketRoute: UpgradeRoute<ServerContext> = {
  path: '/ws',
  auth: 'socket',
  handle: (_req, socket, ctx, { clientKey }) => {
    completeHandshake(socket, clientKey);
    ctx.clients.add(socket);
    handleClientFrames(socket, (text) => onClientText(ctx, socket, text));
    const forget = () => {
      ctx.clients.delete(socket);
      ctx.selections.drop(socket);
    };
    socket.on('end', () => {
      forget();
      socket.end();
    });
    socket.on('close', forget);
    socket.on('error', forget);
    ctx.touch();
  },
};
