export interface AccessPolicy {
  cloudOrigin?: string;
  hosts: ReadonlySet<string>;
  loopback: boolean;
  origins: ReadonlySet<string>;
}

const LOOPBACK = new Set(['localhost', '::1', '[::1]']);

export const isLoopbackHost = (host: string) =>
  LOOPBACK.has(host) || /^127\.\d+\.\d+\.\d+$/.test(host);

const bracket = (host: string) =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

export function accessPolicy({
  host,
  urlHost,
  ports,
  cloudOrigin,
}: {
  cloudOrigin?: string;
  host: string;
  ports: number[];
  urlHost: string;
}): AccessPolicy {
  const names = [
    ...new Set(
      ['localhost', '127.0.0.1', bracket(host), bracket(urlHost)].map((name) => name.toLowerCase()),
    ),
  ];
  const hosts = new Set(ports.flatMap((port) => names.map((name) => `${name}:${port}`)));
  const viewerPort = ports[0];
  const origins = new Set(names.map((name) => `http://${name}:${viewerPort}`));
  return { loopback: isLoopbackHost(host), hosts, origins, cloudOrigin };
}

export const hostAllowed = (policy: AccessPolicy, host: string | undefined) =>
  !policy.loopback || (host !== undefined && policy.hosts.has(host.toLowerCase()));

export const originAllowed = (
  policy: AccessPolicy,
  origin: string | undefined,
  { cloud = false }: { cloud?: boolean } = {},
) =>
  origin === undefined ||
  policy.origins.has(origin) ||
  (cloud && policy.cloudOrigin !== undefined && origin === policy.cloudOrigin);

export const navigationAllowed = (secFetchSite: string | undefined) =>
  secFetchSite === undefined || secFetchSite === 'none' || secFetchSite === 'same-origin';
