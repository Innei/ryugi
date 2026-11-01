import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import { ownLink } from '../shared/cloud';
import type { ArtifactType } from '../shared/types';
import { accessPolicy } from './access';
import { artifactPath, resolveArtifactAddress } from './artifact-address';
import { watchArtifacts } from './artifact-watcher';
import { type ArtifactRef, isArtifactLocator, listArtifacts } from './artifacts';
import { BOARD_PORT_FILE } from './board-port';
import {
  type ArtifactPayload,
  type ChangeListener,
  createServerContext,
  type MountSettings,
  type ServerOptions,
} from './context';
import { readCredentials } from './credentials';
import { hostIdFor } from './host-id';
import { listen, readPersisted, send, urlHostForHttp } from './http';
import { createRelayClient } from './relay';
import { dropRelayViewer, handleRelay, relayWatch } from './relay-requests';
import { createBoardRequestHandler } from './routes/content';
import { HTTP_ROUTES, UPGRADE_ROUTES } from './routes/index';
import { dispatchHttp, dispatchUpgrade } from './routes/table';
import { writeJsonAtomic } from './state';

export type { ArtifactPayload, MountSettings, ServerOptions } from './context';

export interface ArtifactsServer {
  boardPort: number;
  close: () => Promise<void>;
  cloudLinkFor: (type: ArtifactType, id: string) => Promise<string | null>;
  contentToken: string;
  dropRelayViewer: (conn: string) => void;
  handleBoardRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  handleRelay: (key: string, body: unknown, conn: string) => Promise<unknown>;
  handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  handleUpgrade: (req: http.IncomingMessage, socket: Duplex, head?: Buffer) => void;
  linkFor: (type: ArtifactType, id: string) => string;
  liveClients: () => number;
  onActivity: (listener: () => void) => void;
  onArtifactChange: (listener: ChangeListener) => void;
  onRelayEvent: (listener: (key: string, message: unknown) => void) => void;
  port: number;
  relayWatch: (keys: Set<string>) => void;
  resolve: (type: ArtifactType, idOrAddress: string) => string | null;
  root: string;
  served: () => Map<string, string>;
  token: string;
  url: string;
}

export type MountedProject = ArtifactsServer;

const CLOSE_FLUSH_MS = 5000;

export async function startArtifactsServer(options: ServerOptions): Promise<ArtifactsServer> {
  const ctx = createServerContext(options);
  const { root, stateDir, mount, loopback, token, cloud, autoPublisher, clients } = ctx;

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) =>
    dispatchHttp(HTTP_ROUTES, req, res, ctx);

  const server = http.createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
    }
  });

  const handleUpgrade = (req: http.IncomingMessage, socket: Duplex) =>
    dispatchUpgrade(UPGRADE_ROUTES, req, socket, ctx);
  server.on('upgrade', handleUpgrade);

  if (mount) ctx.port = mount.port;
  else {
    const previousPort = Number(readPersisted(ctx.portFile));
    try {
      ctx.port = await listen(
        server,
        options.host,
        Number.isInteger(previousPort) && previousPort > 0 ? previousPort : 0,
      );
    } catch {
      ctx.port = await listen(server, options.host, 0);
    }
    fs.writeFileSync(ctx.portFile, `${ctx.port}\n`, { mode: 0o600 });
  }
  const port = ctx.port;
  ctx.cookieName = `ryugi_artifacts_${port}`;

  const handleBoardRequest = createBoardRequestHandler(ctx);
  const boardServer = http.createServer(handleBoardRequest);
  if (mount) ctx.boardPort = mount.boardPort;
  else if (loopback) {
    const boardPortFile = path.join(stateDir, BOARD_PORT_FILE);
    const previousBoardPort = Number(readPersisted(boardPortFile));
    try {
      ctx.boardPort = await listen(
        boardServer,
        options.host,
        Number.isInteger(previousBoardPort) && previousBoardPort > 0 && previousBoardPort !== port
          ? previousBoardPort
          : 0,
      );
    } catch {
      ctx.boardPort = await listen(boardServer, options.host, 0);
    }
    fs.writeFileSync(boardPortFile, `${ctx.boardPort}\n`, { mode: 0o600 });
  }
  const boardPort = ctx.boardPort;
  ctx.policy = accessPolicy({
    host: options.host,
    urlHost: options.urlHost,
    ports: boardPort ? [port, boardPort] : [port],
    cloudOrigin: options.cloud?.origin,
  });

  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  const url = loopback ? `${origin}/` : `${origin}/?key=${token}`;
  const linkFor = (type: ArtifactType, id: string) =>
    `${origin}${artifactPath(root, type, id)}${loopback ? '' : `?key=${token}`}`;

  const initialChanges: { ref: ArtifactRef; payload: ArtifactPayload; files: string[] }[] = [];
  for (const entry of listArtifacts(root).artifacts) {
    const payload = ctx.refreshState(entry, entry.dir);
    initialChanges.push({ ref: entry, payload, files: [] });
    if (entry.type === 'document') void ctx.documents.open(entry.id);
  }
  writeJsonAtomic(path.join(stateDir, 'server-info'), {
    type: 'server-started',
    url,
    port,
    boardPort,
    root,
  });

  ctx.relay = mount
    ? {
        emit: (key: string, message: unknown) =>
          ctx.relayListeners.forEach((listener) => listener(key, message)),
        close: () => {},
      }
    : options.relay && options.cloud
      ? createRelayClient({
          ...options.relay,
          token: () =>
            readCredentials(options.cloud!.credentialsFile, options.cloud!.origin)?.token ?? null,
          served: ctx.servedArtifacts,
          local: () => ({
            hostId: hostIdFor(options.cloud!.credentialsFile),
            port,
            ...(loopback ? { embed: true, embedDocument: true } : { key: token }),
          }),
          handle: (key, body, conn) => handleRelay(ctx, key, body, conn),
          onActivity: ctx.touch,
          onWatch: (keys) => relayWatch(ctx, keys),
        })
      : null;

  const watcher = watchArtifacts(ctx);

  return {
    port,
    boardPort,
    token,
    contentToken: ctx.contentToken,
    url,
    root,
    linkFor,
    handleRequest: (req, res) => {
      try {
        handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      }
    },
    handleUpgrade,
    handleBoardRequest,
    handleRelay: (key, body, conn) => handleRelay(ctx, key, body, conn, `http://127.0.0.1:${port}`),
    dropRelayViewer: (conn) => dropRelayViewer(ctx, conn),
    served: ctx.servedArtifacts,
    onRelayEvent: (listener) => ctx.relayListeners.push(listener),
    relayWatch: (keys) => relayWatch(ctx, keys),
    liveClients: () => clients.size,
    resolve: (type, idOrAddress) => {
      if (!isArtifactLocator(idOrAddress)) return null;
      return resolveArtifactAddress(root, type, idOrAddress)?.id ?? null;
    },
    cloudLinkFor: async (type, id) => {
      if (
        !cloud ||
        !options.cloud ||
        !readCredentials(options.cloud.credentialsFile, options.cloud.origin)
      )
        return null;
      const { url } = await cloud.reserve({ type, id });
      return url ? ownLink(url, hostIdFor(options.cloud.credentialsFile)) : null;
    },
    onArtifactChange: (listener) => {
      ctx.changeListeners.push(listener);
      for (const change of initialChanges) listener(change.ref, change.payload, change.files);
    },
    onActivity: (listener) => ctx.activityListeners.push(listener),
    close: async () => {
      clearInterval(ctx.listeningTimer);
      await ctx.recordings.close();
      await Promise.race([
        autoPublisher?.flush(),
        new Promise((resolve) => setTimeout(resolve, CLOSE_FLUSH_MS).unref()),
      ]);
      await new Promise<void>((resolve) => {
        watcher.close();
        autoPublisher?.close();
        ctx.relay?.close();
        ctx.direct.close();
        ctx.selections.clearAll();
        for (const socket of clients) socket.destroy();
        boardServer.close();
        boardServer.closeAllConnections();
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await ctx.documents.close().catch(() => undefined);
      if (mount) fs.rmSync(path.join(stateDir, 'server-info'), { force: true });
    },
  };
}

export const mountArtifactsProject = (
  options: ServerOptions & { mount: MountSettings },
): Promise<MountedProject> => startArtifactsServer(options);
