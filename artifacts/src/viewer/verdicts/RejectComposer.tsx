import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

import { Composer } from '../document/Composer';
import { useTranslation } from '../i18n';
import { color } from '../tokens.stylex';

const styles = stylex.create({
  card: {
    position: 'absolute',
    zIndex: 9,
    width: 340,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    color: cssVar.colorText,
    cursor: 'default',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingInline: 14,
    fontSize: 11,
  },
  verdict: { color: color.danger, fontWeight: 600 },
  group: { fontFamily: cssVar.fontFamilyCode, color: cssVar.colorTextTertiary },
  required: { marginInlineStart: 'auto', color: cssVar.colorTextTertiary },
  hint: {
    paddingInline: 14,
    paddingBottom: 10,
    fontSize: 10,
    lineHeight: 1.6,
    color: cssVar.colorTextQuaternary,
  },
});

interface Props {
  group: string;
  left: number;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<boolean>;
  top: number;
}

export function RejectComposer({ group, left, top, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <div data-chrome="reject" {...stylex.props(styles.card)} style={{ left, top }}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.verdict)}>{t('verdict.reject')}</span>
        <span {...stylex.props(styles.group)}>{group}</span>
        <span {...stylex.props(styles.required)}>{t('verdict.reasonRequired')}</span>
      </div>
      <Composer
        autoFocus
        placeholder={t('verdict.reasonPlaceholder')}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
      <div {...stylex.props(styles.hint)}>{t('verdict.rejectHint')}</div>
    </div>
  );
}
