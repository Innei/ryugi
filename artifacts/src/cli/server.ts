import { machinePaths, readProjects } from '../server/machine';
import { CliError, invocation, projectPaths } from './paths';
import { readText } from './process';

export const notRunning = (project: string) =>
  `No artifacts server is running for this project. Start it with \`${invocation()} start --project-dir ${project}\`, then run this again.`;

export interface ServerResponse {
  json: Record<string, any>;
  status: number;
}

const readUrl = (file: string) => {
  try {
    const { url } = JSON.parse(readText(file) ?? '') as { url?: unknown };
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
};

function serverUrl(project: string, projectInfo: string) {
  const machine = machinePaths();
  const machineUrl = readUrl(machine.info);
  if (machineUrl) {
    const registered = readProjects(machine.projects).some((entry) => entry.dir === project);
    return registered ? machineUrl : null;
  }
  return readUrl(projectInfo);
}

export function serverClient(projectDir: string) {
  const paths = projectPaths(projectDir);
  const url = serverUrl(paths.project, paths.info);
  if (!url) throw new CliError(notRunning(paths.project));
  const base = new URL(url);
  const key = base.searchParams.get('key') ?? '';
  if (base.hostname === 'localhost') base.hostname = '127.0.0.1';
  return {
    project: paths.project,
    async call(method: string, route: string, body?: unknown): Promise<ServerResponse> {
      let res: Response;
      try {
        res = await fetch(`${base.origin}${route}?key=${encodeURIComponent(key)}`, {
          method,
          headers: {
            'X-Ryugi-Project': encodeURIComponent(paths.project),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new CliError(notRunning(paths.project));
      }
      return {
        status: res.status,
        json: (await res.json().catch(() => ({}))) as Record<string, any>,
      };
    },
  };
}
