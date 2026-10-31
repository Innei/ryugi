export const BOARD_SANDBOX_SAME_SITE =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';
export const BOARD_SANDBOX_OPAQUE = 'allow-scripts';

export interface BoardOrigin {
  base: string;
  mode: 'same-site' | 'opaque';
  sandbox: string;
}

interface Input {
  boardPath?: string;
  boardPort?: number;
  contentBase: string;
  location: { hostname: string; origin: string; protocol: string };
  reachable?: boolean;
}

const hostFor = (hostname: string) => (hostname.includes(':') ? `[${hostname}]` : hostname);

export function boardOrigin({
  location,
  contentBase,
  boardPort,
  boardPath,
  reachable,
}: Input): BoardOrigin {
  if (/^https?:\/\//.test(contentBase)) {
    const sameOrigin = new URL(contentBase).origin === location.origin;
    return {
      base: contentBase,
      sandbox: sameOrigin ? BOARD_SANDBOX_OPAQUE : BOARD_SANDBOX_SAME_SITE,
      mode: sameOrigin ? 'opaque' : 'same-site',
    };
  }
  if (boardPort && boardPath && reachable)
    return {
      base: `${location.protocol}//${hostFor(location.hostname)}:${boardPort}${boardPath}`,
      sandbox: BOARD_SANDBOX_SAME_SITE,
      mode: 'same-site',
    };
  return { base: contentBase, sandbox: BOARD_SANDBOX_OPAQUE, mode: 'opaque' };
}

export const boardProbeUrl = (location: Input['location'], boardPort: number) =>
  `${location.protocol}//${hostFor(location.hostname)}:${boardPort}/robots.txt`;
