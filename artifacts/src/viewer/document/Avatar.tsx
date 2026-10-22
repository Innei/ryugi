import {
  Amp,
  Antigravity,
  Claude,
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  Devin,
  GeminiCLI,
  GithubCopilot,
  Goose,
  KiloCode,
  OpenCode,
  Qwen,
  Replit,
  RooCode,
  V0,
} from '@lobehub/icons';
import * as stylex from '@stylexjs/stylex';
import { useState, type ComponentType, type CSSProperties } from 'react';
import { agentIconOf, type AgentIconKey } from './author';
import { brand } from '../tokens.stylex';

const SIZE = 20;

type IconAvatar = ComponentType<{ size: number; shape?: 'circle' | 'square'; style?: CSSProperties }>;

const ICONS: Record<AgentIconKey, { Avatar: IconAvatar }> = {
  Amp,
  Antigravity,
  Claude,
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  Devin,
  GeminiCLI,
  GithubCopilot,
  Goose,
  KiloCode,
  OpenCode,
  Qwen,
  Replit,
  RooCode,
  V0,
};

const styles = stylex.create({
  avatar: { width: SIZE, height: SIZE, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10 },
  image: { width: SIZE, height: SIZE, flexShrink: 0, borderRadius: '50%', objectFit: 'cover' },
  human: { backgroundColor: '#2f6fd6' },
  agent: { backgroundColor: brand.accentStrong },
});

interface Props {
  human: boolean;
  initial?: string;
  name?: string;
  src?: string;
}

export function Avatar({ human, initial, name, src }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const icon = !human && name ? agentIconOf(name) : undefined;
  if (icon) {
    const Icon = ICONS[icon];
    return <Icon.Avatar size={SIZE} shape="circle" style={{ flexShrink: 0 }} />;
  }
  if (src && failed !== src) {
    return <img src={src} alt="" width={SIZE} height={SIZE} onError={() => setFailed(src)} {...stylex.props(styles.image)} />;
  }
  return <span {...stylex.props(styles.avatar, human ? styles.human : styles.agent)}>{initial ?? (human ? '你' : 'A')}</span>;
}
