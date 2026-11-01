import type { ServerContext } from '../context';
import { agentBoardCommentsRoute, agentCheckRoute, agentCommentsRoute } from './agent';
import {
  artifactApiRoute,
  avatarRoute,
  listRoute,
  previewApiRoute,
  thumbnailRoute,
} from './artifacts';
import {
  cloudApiRoute,
  cloudAutoPublishCallbackRoute,
  cloudCallbackRoute,
  cloudFlushRoute,
} from './cloud';
import { boardCommentsRoute } from './comments';
import { contentRoute, robotsRoute, statusRoute } from './content';
import { documentStateRoute, documentWriteRoute } from './documents';
import { clientSocketRoute, directRelayRoute } from './sockets';
import type { HttpRoute, UpgradeRoute } from './table';
import { embedRoute, libraryRoute, shellRoute, viewerFileRoute } from './viewer';

// Order matters: earlier routes shadow later ones.
export const HTTP_ROUTES: HttpRoute<ServerContext>[] = [
  statusRoute,
  robotsRoute,
  contentRoute,
  cloudCallbackRoute,
  cloudAutoPublishCallbackRoute,
  listRoute,
  avatarRoute,
  previewApiRoute,
  thumbnailRoute,
  cloudFlushRoute,
  cloudApiRoute,
  agentCommentsRoute,
  agentBoardCommentsRoute,
  agentCheckRoute,
  boardCommentsRoute,
  documentStateRoute,
  documentWriteRoute,
  artifactApiRoute,
  embedRoute,
  libraryRoute,
  shellRoute,
  viewerFileRoute,
];

export const UPGRADE_ROUTES: UpgradeRoute<ServerContext>[] = [directRelayRoute, clientSocketRoute];
