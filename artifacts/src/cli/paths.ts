import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ProjectPaths {
  project: string;
  root: string;
  state: string;
  pid: string;
  log: string;
  serverId: string;
  info: string;
  version: string;
  owners: string;
  agent: string;
  stopped: string;
  lock: string;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, unknown> = {},
    readonly code = 1,
  ) {
    super(message);
  }
}

// Launchers before this release ship hooks that read the given directory, so only a launcher that says so gets resolution.
const resolvesRoot = () =>
  !process.env.RYUGI_ARTIFACTS_COMMAND || process.env.RYUGI_ARTIFACTS_RESOLVE_ROOT === '1';

function projectRoot(dir: string) {
  let home = '';
  try {
    home = fs.realpathSync(os.homedir());
  } catch {}
  const chain: string[] = [];
  for (let current = dir; ; current = path.dirname(current)) {
    chain.push(current);
    if (fs.existsSync(path.join(current, '.git')) && (current !== home || dir === home)) break;
    if (path.dirname(current) === current) return dir;
  }
  return (
    chain.find((candidate) => fs.existsSync(path.join(candidate, '.ryugi', 'artifacts'))) ??
    chain[chain.length - 1]!
  );
}

export function projectPaths(dir: string): ProjectPaths {
  let project: string;
  try {
    project = fs.realpathSync(path.resolve(dir));
    if (!fs.statSync(project).isDirectory()) throw new Error();
  } catch {
    throw new CliError(`Project directory not found: ${dir}`);
  }
  if (resolvesRoot()) project = projectRoot(project);
  const root = path.join(project, '.ryugi', 'artifacts');
  const state = path.join(root, '.state');
  return {
    project,
    root,
    state,
    pid: path.join(state, 'server.pid'),
    log: path.join(state, 'server.log'),
    serverId: path.join(state, 'server-instance-id'),
    info: path.join(state, 'server-info'),
    version: path.join(state, 'server-version'),
    owners: path.join(state, 'owners'),
    agent: path.join(state, 'agent'),
    stopped: path.join(state, 'server-stopped'),
    lock: path.join(state, 'start.lock'),
  };
}

// The skill runs the CLI through its launcher, so `ryugi-artifacts` is not on its PATH.
export const invocation = () => process.env.RYUGI_ARTIFACTS_COMMAND || 'ryugi-artifacts';

export const ARTIFACT_PATTERN = /^(artboard|document|html)\/[a-z0-9][a-z0-9-]*$/;
export const ARTIFACT_ERROR =
  '--artifact must be <type>/<id>: type artboard, document or html, id of lowercase letters, digits and hyphens';
