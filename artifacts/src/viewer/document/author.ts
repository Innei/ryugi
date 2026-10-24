import type { Message } from '../../shared/comments';

export type AgentIconKey =
  | 'ClaudeCode'
  | 'Claude'
  | 'Codex'
  | 'Cursor'
  | 'GeminiCLI'
  | 'Grok'
  | 'GithubCopilot'
  | 'KiloCode'
  | 'OpenCode'
  | 'Qwen'
  | 'Antigravity'
  | 'Goose'
  | 'Amp'
  | 'Cline'
  | 'RooCode'
  | 'Devin'
  | 'Replit'
  | 'V0';

const AGENT_ICONS: Record<string, AgentIconKey> = {
  'Claude Code': 'ClaudeCode',
  'Claude Cowork': 'Claude',
  Codex: 'Codex',
  Cursor: 'Cursor',
  'Gemini CLI': 'GeminiCLI',
  Grok: 'Grok',
  'GitHub Copilot': 'GithubCopilot',
  'Kilo Code': 'KiloCode',
  OpenCode: 'OpenCode',
  'Qwen Code': 'Qwen',
  Antigravity: 'Antigravity',
  Goose: 'Goose',
  Amp: 'Amp',
  Cline: 'Cline',
  'Roo Code': 'RooCode',
  Devin: 'Devin',
  Replit: 'Replit',
  v0: 'V0',
};

export const agentIconOf = (name: string): AgentIconKey | undefined => AGENT_ICONS[name];

export function authorOf({ author, name }: Pick<Message, 'author' | 'name'>): { label: string; initial: string } {
  const label = name ?? (author === 'human' ? '你' : 'Agent');
  return { label, initial: [...label][0]!.toUpperCase() };
}
