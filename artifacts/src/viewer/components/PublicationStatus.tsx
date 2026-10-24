import { Icon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CheckCircle2, CircleAlert, Clock3, CloudUpload, LoaderCircle } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { publishing, type Publication } from '../../shared/cloud';
import { useTranslation } from '../i18n';

const styles = stylex.create({
  summary: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap', color: cssVar.colorWarningText },
  card: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, marginBottom: 12, borderRadius: 7, backgroundColor: cssVar.colorWarningBg, color: cssVar.colorWarningText },
  success: { backgroundColor: cssVar.colorSuccessBg, color: cssVar.colorSuccessText },
  failed: { backgroundColor: cssVar.colorErrorBg, color: cssVar.colorErrorText },
  heading: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 },
  body: { margin: 0, color: cssVar.colorTextSecondary, fontSize: 11.5, lineHeight: 1.75 },
  reasons: { margin: 0, paddingInlineStart: 18, fontSize: 11, lineHeight: 1.75 },
  action: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 30, padding: '5px 10px', borderWidth: 0, borderRadius: 5, backgroundColor: cssVar.colorText, color: cssVar.colorBgContainer, font: 'inherit', fontSize: 12, cursor: 'pointer' },
  old: { paddingTop: 8, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: cssVar.colorBorderSecondary },
});

interface Props {
  publication?: Publication | null;
  published: boolean;
  publishedAt?: string | null;
  online?: boolean | null;
  onPublish?: () => void;
  compact?: boolean;
  busy?: boolean;
}

export function PublicationStatus({ publication, published, publishedAt, online, onPublish, compact = false, busy = false }: Props) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const phase = publication?.phase ?? (published ? 'published' : 'waiting');
  const updating = published && phase !== 'published';
  const active = publishing(phase);
  const title = t(`publication.${updating ? `update_${phase}` : phase}`);
  const StatusIcon = active ? LoaderCircle : phase === 'failed' ? CircleAlert : phase === 'published' ? CheckCircle2 : Clock3;
  const tone = phase === 'failed' ? styles.failed : phase === 'published' ? styles.success : undefined;
  const icon = <Icon icon={StatusIcon} spin={active && !reducedMotion} size={compact ? 14 : 16} aria-hidden="true" />;
  if (compact) return <span role="status" {...stylex.props(styles.summary, tone)}>{icon}{title}</span>;
  const time = publication?.publishedAt ?? publishedAt;
  const canPublish = onPublish && !active && phase !== 'published' && phase !== 'not-ready';
  return (
    <section aria-label={t('publication.label')} {...stylex.props(styles.card, tone)}>
      <div role="status" {...stylex.props(styles.heading)}>{icon}{title}</div>
      <p {...stylex.props(styles.body)}>{t(updating && phase === 'waiting' ? 'publication.updateWaitingDescription' : updating && phase === 'failed' ? 'publication.updateFailedDescription' : `publication.${phase}Description`)}</p>
      {publication?.message ? <p role="alert" {...stylex.props(styles.body)}>{publication.message}</p> : null}
      {publication?.reasons?.length ? <ul {...stylex.props(styles.reasons)}>{publication.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}
      {canPublish ? <button type="button" disabled={busy} onClick={onPublish} {...stylex.props(styles.action)}><CloudUpload size={14} aria-hidden="true" />{t(phase === 'failed' ? 'publication.retry' : 'publication.publishNow')}</button> : null}
      {!active && phase !== 'published' ? <p {...stylex.props(styles.body)}>{t(online === false ? 'publication.offline' : !onPublish && online === true ? 'publication.updateLocal' : publication?.autoPublish ? 'publication.autoPublish' : 'publication.manualPublish')}</p> : null}
      {updating ? <p {...stylex.props(styles.body, styles.old)}>{t('publication.previousVersion')}{time ? <> <time dateTime={time}>{new Date(time).toLocaleString(i18n.language)}</time></> : null}</p> : null}
    </section>
  );
}
