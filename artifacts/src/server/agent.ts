type Env = Record<string, string | undefined>;

const NAMES: Record<string, string> = {
  claude: 'Claude Code',
  'claude-code': 'Claude Code',
  cowork: 'Claude Cowork',
  codex: 'Codex',
  cursor: 'Cursor',
  'cursor-cli': 'Cursor',
  gemini: 'Gemini CLI',
  'gemini-cli': 'Gemini CLI',
  grok: 'Grok',
  'grok-cli': 'Grok',
  'github-copilot': 'GitHub Copilot',
  'github-copilot-cli': 'GitHub Copilot',
  kilo: 'Kilo Code',
  omp: 'OMP',
  'oh-my-pi': 'OMP',
  opencode: 'OpenCode',
  'qwen-code': 'Qwen Code',
  antigravity: 'Antigravity',
  augment: 'Augment',
  'augment-cli': 'Augment',
  goose: 'Goose',
  amp: 'Amp',
  cline: 'Cline',
  roo: 'Roo Code',
  devin: 'Devin',
  replit: 'Replit',
  v0: 'v0',
};

export const AGENT_DISPLAY_NAMES = [...new Set(Object.values(NAMES))];

// Order matters: Cowork also sets the Claude Code markers, Kilo is an OpenCode fork that sets OpenCode's,
// and omp and Grok set CLAUDECODE so Claude-compatible extensions keep loading.
const MARKERS: [string, (env: Env) => boolean][] = [
  ['omp', (env) => !!env.OMPCODE],
  ['grok', (env) => !!(env.GROK_AGENT || env.GROK_SESSION_ID)],
  ['cowork', (env) => !!env.CLAUDE_CODE_IS_COWORK],
  ['kilo', (env) => !!env.KILO],
  ['codex', (env) => !!(env.CODEX_THREAD_ID || env.CODEX_SANDBOX || env.CODEX_CI)],
  ['cursor', (env) => !!(env.CURSOR_AGENT || env.CURSOR_TRACE_ID)],
  ['gemini', (env) => !!env.GEMINI_CLI],
  ['github-copilot', (env) => !!env.COPILOT_CLI],
  ['opencode', (env) => env.OPENCODE === '1' || !!env.OPENCODE_CLIENT],
  ['qwen-code', (env) => !!env.QWEN_CODE],
  ['antigravity', (env) => !!env.ANTIGRAVITY_AGENT],
  ['augment', (env) => !!env.AUGMENT_AGENT],
  ['cline', (env) => !!env.CLINE_ACTIVE],
  ['roo', (env) => !!env.ROO_ACTIVE],
  ['claude', (env) => !!(env.CLAUDECODE || env.CLAUDE_CODE)],
];

export const AGENT_MARKERS = [
  'AI_AGENT',
  'AGENT',
  'OMPCODE',
  'GROK_AGENT',
  'GROK_SESSION_ID',
  'CLAUDE_CODE_IS_COWORK',
  'KILO',
  'CODEX_THREAD_ID',
  'CODEX_SANDBOX',
  'CODEX_CI',
  'CURSOR_AGENT',
  'CURSOR_TRACE_ID',
  'GEMINI_CLI',
  'COPILOT_CLI',
  'OPENCODE',
  'OPENCODE_CLIENT',
  'QWEN_CODE',
  'ANTIGRAVITY_AGENT',
  'AUGMENT_AGENT',
  'CLINE_ACTIVE',
  'ROO_ACTIVE',
  'CLAUDECODE',
  'CLAUDE_CODE',
];

// AI_AGENT is either `name@version` (Vercel's proposal) or `name_version_mode` (Claude Code).
const declaredName = (value: string | undefined) => value?.trim().split(/[@_]/)[0]?.toLowerCase() || undefined;

export function detectAgent(env: Env): string | undefined {
  if (env.CLAUDE_CODE_IS_COWORK) return NAMES.cowork;
  const declared = declaredName(env.AI_AGENT);
  if (declared) return NAMES[declared] ?? declared;
  const marked = MARKERS.find(([, test]) => test(env))?.[0];
  if (marked) return NAMES[marked];
  const agent = declaredName(env.AGENT);
  if (agent && !/^(1|true|yes)$/.test(agent)) return NAMES[agent] ?? agent;
  return undefined;
}
