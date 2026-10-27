import { CliError, invocation, projectPaths } from './paths';
import { readText } from './process';

export const notRunning = (project: string) =>
  `No artifacts server is running for this project. Start it with \`${invocation()} start --project-dir ${project}\`, then run this again.`;

export interface ServerResponse {
  json: Record<string, any>;
  status: number;
}

export function serverClient(projectDir: string) {
  const paths = projectPaths(projectDir);
  let info: { url: string };
  try {
    info = JSON.parse(readText(paths.info) ?? '');
  } catch {
    throw new CliError(notRunning(paths.project));
  }
  const base = new URL(info.url);
  const key = base.searchParams.get('key') ?? '';
  if (base.hostname === 'localhost') base.hostname = '127.0.0.1';
  return {
    project: paths.project,
    async call(method: string, route: string, body?: unknown): Promise<ServerResponse> {
      let res: Response;
      try {
        res = await fetch(`${base.origin}${route}?key=${encodeURIComponent(key)}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
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
