import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { NodeKey } from 'lexical';
import { createContext, useContext } from 'react';

import { t } from '../i18n';
import { brand } from '../tokens.stylex';
import type { AgentActivity } from './agentActivity';

export interface PendingProgress {
  activity: AgentActivity['kind'];
  agent: string;
  nextKey: NodeKey | null;
}

export const PendingContext = createContext<PendingProgress | null>(null);

const REDUCED = '@media (prefers-reduced-motion: reduce)';

const sweep = stylex.keyframes({
  from: { backgroundPosition: '150% 0' },
  to: { backgroundPosition: '-50% 0' },
});

const blink = stylex.keyframes({
  '0%, 45%': { opacity: 1 },
  '55%, 100%': { opacity: 0 },
});

const styles = stylex.create({
  block: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBlock: 8,
    userSelect: 'none',
    fontSize: 15,
    lineHeight: 1.7,
  },
  ghost: { color: cssVar.colorTextTertiary },
  shine: {
    backgroundImage: {
      default: `linear-gradient(90deg, ${cssVar.colorTextTertiary} 0%, ${cssVar.colorTextTertiary} 40%, ${brand.accent} 50%, ${cssVar.colorTextTertiary} 60%, ${cssVar.colorTextTertiary} 100%)`,
      [REDUCED]: 'none',
    },
    backgroundSize: '250% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: { default: 'transparent', [REDUCED]: cssVar.colorTextTertiary },
    animationName: { default: sweep, [REDUCED]: 'none' },
    animationDuration: '2.4s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  tag: {
    flexShrink: 0,
    alignSelf: 'center',
    paddingInline: 6,
    borderRadius: 4,
    backgroundColor: cssVar.colorWarningBg,
    color: cssVar.colorWarningText,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: '18px',
  },
  caret: {
    position: 'relative',
    display: 'inline-block',
    width: 2,
    height: '1.2em',
    marginLeft: 2,
    verticalAlign: '-0.2em',
  },
  bar: {
    position: 'absolute',
    inset: 0,
    borderRadius: 1,
    backgroundColor: brand.accent,
    animationName: { default: blink, [REDUCED]: 'none' },
    animationDuration: '1.1s',
    animationTimingFunction: 'steps(1, end)',
    animationIterationCount: 'infinite',
  },
  label: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 2,
    paddingInline: 4,
    borderRadius: 3,
    backgroundColor: brand.accentStrong,
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  },
});

export function PendingBlock({ nodeKey, intent }: { nodeKey: NodeKey; intent: string }) {
  const progress = useContext(PendingContext);
  const kind = progress?.activity;
  const next = progress?.nextKey === nodeKey && kind === 'working';
  return (
    <div
      data-next={next ? 'true' : undefined}
      data-pending=""
      title={t('document.pending')}
      {...stylex.props(styles.block)}
    >
      {kind === 'stale' ? (
        <span {...stylex.props(styles.tag)}>{t('document.unfinished')}</span>
      ) : null}
      <p style={{ margin: 0 }}>
        <span {...stylex.props(styles.ghost, next && styles.shine)}>
          {intent || t('document.pending')}
        </span>
        {next ? (
          <span aria-hidden data-caret="" {...stylex.props(styles.caret)}>
            <span {...stylex.props(styles.bar)} />
            <span {...stylex.props(styles.label)}>{progress!.agent}</span>
          </span>
        ) : null}
      </p>
    </div>
  );
}
