import type { ArtifactSummary } from './types';

export interface HubArtifact extends ArtifactSummary {
  project: string;
  url: string;
}

export interface HubArtifactList {
  artifacts: HubArtifact[];
  projects: HubProjectStatus[];
  warnings: string[];
}

export interface HubProjectStatus {
  artifacts: number;
  dir: string;
  dormant: boolean;
  lastUsedAt: number;
  name: string;
}

export interface HubStatus {
  boardPort: number;
  clients: number;
  lastActivity: number;
  latest: string | null;
  live: { local: number; relay: number };
  pid: number;
  port: number;
  projects: HubProjectStatus[];
  relay: { announced: number; connected: boolean };
  startedAt: number;
  url: string;
  version: string;
}
