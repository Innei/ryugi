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
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!status?.signedIn || status.autoPublish?.global !== null) return null;
  const answer = async (value: boolean) => {
    setBusy(true);
    await onAnswer(value);
    setBusy(false);
  };
  return (
    <aside role="dialog" aria-label={t('autoPublish.label')} {...stylex.props(styles.card)}>
      <CloudUpload size={16} />
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.title)}>{t('autoPublish.title')}</span>
        <span {...stylex.props(styles.hint)}>{t('autoPublish.hint')}</span>
      </span>
      <span {...stylex.props(styles.actions)}>
        <button type="button" disabled={busy} onClick={() => void answer(false)} {...stylex.props(styles.button)}>
          {t('autoPublish.later')}
        </button>
        <button type="button" disabled={busy} onClick={() => void answer(true)} {...stylex.props(styles.button, styles.primary)}>
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
      onAnswer={async (value) => {
        await cloudRequest('POST', 'auto-publish', { scope: 'global', value });
        await refresh();
      }}
    />
  );
}
