import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CloudUpload } from 'lucide-react';
import { useState } from 'react';

import type { CloudStatus } from '../../shared/cloud';
import { cloudRequest, useCloudStatus } from '../hooks/useCloudStatus';
import { useTranslation } from '../i18n';

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
    backgroundColor: { 'default': cssVar.colorFillTertiary, ':hover': cssVar.colorFillSecondary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
  },
  primary: {
    backgroundColor: { 'default': cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    color: cssVar.colorBgLayout,
  },
});

interface Props {
  onAnswer: (answer: 'on' | 'later') => Promise<void>;
  status: CloudStatus | null;
}

export function AutoPublishPrompt({ status, onAnswer }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!status?.signedIn || status.autoPublish?.global !== null || status.autoPublish.postponed)
    return null;
  const answer = async (value: 'on' | 'later') => {
    setBusy(true);
    await onAnswer(value);
    setBusy(false);
  };
  return (
    <aside aria-label={t('autoPublish.label')} role="dialog" {...stylex.props(styles.card)}>
      <CloudUpload size={16} />
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.title)}>{t('autoPublish.title')}</span>
        <span {...stylex.props(styles.hint)}>{t('autoPublish.hint')}</span>
      </span>
      <span {...stylex.props(styles.actions)}>
        <button
          disabled={busy}
          type="button"
          onClick={() => void answer('later')}
          {...stylex.props(styles.button)}
        >
          {t('autoPublish.later')}
        </button>
        <button
          disabled={busy}
          type="button"
          onClick={() => void answer('on')}
          {...stylex.props(styles.button, styles.primary)}
        >
          {t('autoPublish.turnOn')}
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
      onAnswer={async (answer) => {
        await (answer === 'on'
          ? cloudRequest('POST', 'auto-publish', { scope: 'global', value: true })
          : cloudRequest('POST', 'auto-publish/later'));
        await refresh();
      }}
    />
  );
}
