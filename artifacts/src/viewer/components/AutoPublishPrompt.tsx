import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CloudUpload } from 'lucide-react';
import { useState } from 'react';
import type { CloudStatus } from '../../shared/cloud';
import { cloudRequest, useCloudStatus } from '../hooks/useCloudStatus';

const styles = stylex.create({
  card: {
    position: 'fixed',
    insetInline: 16,
    bottom: 16,
    zIndex: 20,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    marginInline: 'auto',
    paddingBlock: 10,
    paddingInline: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 10,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowTertiary,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  text: { flex: '1 1 240px', lineHeight: 1.5 },
  title: { display: 'block', fontWeight: 600 },
  hint: { display: 'block', color: cssVar.colorTextSecondary },
  actions: { display: 'flex', gap: 6, marginInlineStart: 'auto' },
  button: {
    paddingBlock: 4,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: { default: cssVar.colorFillTertiary, ':hover': cssVar.colorFillSecondary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
  },
  primary: {
    backgroundColor: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    color: cssVar.colorBgLayout,
  },
});

interface Props {
  status: CloudStatus | null;
  onAnswer: (value: boolean) => Promise<void>;
}

export function AutoPublishPrompt({ status, onAnswer }: Props) {
  const [busy, setBusy] = useState(false);
  if (!status?.signedIn || status.autoPublish?.global !== null) return null;
  const answer = async (value: boolean) => {
    setBusy(true);
    await onAnswer(value);
    setBusy(false);
  };
  return (
    <aside role="dialog" aria-label="自动发布" {...stylex.props(styles.card)}>
      <CloudUpload size={16} />
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.title)}>要打开自动发布吗？</span>
        <span {...stylex.props(styles.hint)}>agent 每轮结束后，改过的 artifact 会以私密方式同步到 Ryugi Cloud，换台设备登录后也能打开。</span>
      </span>
      <span {...stylex.props(styles.actions)}>
        <button type="button" disabled={busy} onClick={() => void answer(false)} {...stylex.props(styles.button)}>
          以后再说
        </button>
        <button type="button" disabled={busy} onClick={() => void answer(true)} {...stylex.props(styles.button, styles.primary)}>
          打开
        </button>
      </span>
    </aside>
  );
}

export function AutoPublishBar() {
  const { status, refresh } = useCloudStatus();
  return (
    <AutoPublishPrompt
      status={status}
      onAnswer={async (value) => {
        await cloudRequest('POST', 'auto-publish', { scope: 'global', value });
        await refresh();
      }}
    />
  );
}
