export type ReplaceDecision = 'replace' | 'keep' | 'keep-older-cli';

const isLocal = (version: string) => version.startsWith('local-');

function compare(a: string, b: string) {
  const pa = a.split(/[.-]/).slice(0, 3).map(Number);
  const pb = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export function replaceDecision(running: string, cli: string): ReplaceDecision {
  if (!cli) return 'keep';
  if (!running) return 'replace';
  if (running === cli) return 'keep';
  if (isLocal(cli)) return 'replace';
  if (isLocal(running)) return 'keep';
  return compare(cli, running) > 0 ? 'replace' : 'keep-older-cli';
}
