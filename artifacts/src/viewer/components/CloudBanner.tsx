import { FormField, Input, Popover, Switch } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowRight, CircleAlert, Copy, Globe, Lock, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Publication, Visibility } from '../../shared/cloud';
import type { ArtifactType } from '../../shared/types';
import type { CloudHeaderState } from '../hooks/useCloudHeader';
import { pageLink, usePageQuery } from '../hooks/usePageQuery';
import { changeVisibility, CloudRequestError, INSTALL_URL, planLimitMessage } from '../lib/cloud-shell';
import { isSlotLimit, openPlanLimitDialog } from './PlanLimitDialog';
import { RailSwitch } from './RailSwitch';
import { RyugiMark } from './RyugiMark';
import { useTranslation } from '../i18n';
import { PublicationStatus } from './PublicationStatus';

const NARROW = '@media (max-width: 640px)';

const styles = stylex.create({
  bar: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: { default: 24, [NARROW]: 12 },
    height: 45,
    paddingInline: { default: 24, [NARROW]: 12 },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgContainer,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  left: { display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 },
  brand: { display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, minHeight: 40, color: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary }, textDecoration: 'none', borderRadius: 5 },
  name: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.4px', marginInlineStart: -2 },
  crumb: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap' },
  slash: { color: cssVar.colorTextTertiary },
  type: { display: { default: 'contents', [NARROW]: 'none' }, color: cssVar.colorTextSecondary },
  title: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 },
  actions: { display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 },
  statuses: { display: { default: 'flex', [NARROW]: 'none' }, alignItems: 'center', gap: 16, color: cssVar.colorTextSecondary },
  status: { display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  dot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: cssVar.colorTextQuaternary },
  online: { backgroundColor: cssVar.colorSuccess },
  activity: { maxWidth: 260, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: cssVar.colorInfoText },
  activityQuiet: { color: cssVar.colorTextSecondary },
  activityWarning: { color: cssVar.colorWarningText },
  retrying: { color: cssVar.colorWarningText, whiteSpace: 'nowrap' },
  divider: { width: 1, height: 18, backgroundColor: cssVar.colorBorderSecondary },
  visibilityLabel: { display: { default: 'inline', [NARROW]: 'none' } },
  cta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    fontWeight: 500,
    minHeight: 40,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingBlock: 5,
    paddingInline: 9,
    borderRadius: 999,
    backgroundColor: cssVar.colorFillTertiary,
    color: cssVar.colorTextSecondary,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  share: {
    position: 'relative',
    height: 28,
    paddingBlock: 0,
    paddingInline: 14,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: { default: cssVar.colorText, ':hover': cssVar.colorTextSecondary },
    color: cssVar.colorBgLayout,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
    '::before': { content: '""', position: 'absolute', insetBlock: -6, insetInline: 0 },
  },
  shareRound: { borderRadius: 999 },
  disabled: { backgroundColor: cssVar.colorFillTertiary, color: cssVar.colorTextDisabled, cursor: 'not-allowed' },
  panel: { display: 'flex', flexDirection: 'column', gap: 2, width: 'min(288px, calc(100vw - 16px))', fontFamily: cssVar.fontFamily, fontSize: 12 },
  panelInline: { width: '100%' },
  heading: { margin: '2px 4px 6px', fontSize: 12, fontWeight: 600 },
  options: { display: 'flex', flexDirection: 'column', gap: 2 },
  option: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 7,
    backgroundColor: { default: 'transparent', ':hover': cssVar.colorFillQuaternary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    textAlign: 'start',
    cursor: 'pointer',
  },
  optionOn: { borderColor: cssVar.colorBorder, backgroundColor: cssVar.colorFillQuaternary },
  icon: { display: 'grid', placeItems: 'center', flex: 'none', width: 24, height: 24, borderRadius: 6, backgroundColor: cssVar.colorFillTertiary },
  label: { display: 'block', fontSize: 12, fontWeight: 600, lineHeight: 1.3 },
  hint: { display: 'block', color: cssVar.colorTextTertiary, fontSize: 11, lineHeight: 1.3 },
  link: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 },
  url: {
    flex: 1,
    minWidth: 0,
    paddingBlock: 5,
    paddingInline: 8,
    borderRadius: 5,
    backgroundColor: cssVar.colorFillQuaternary,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  foot: { margin: '6px 4px 0', color: cssVar.colorTextTertiary, fontSize: 11 },
  error: { margin: '6px 4px 0', color: cssVar.colorError, fontSize: 11 },
});

const OPTIONS = [
  { value: 'private', label: 'visibility.onlyMe', hint: 'visibility.onlyMeHint', Icon: Lock },
  { value: 'public', label: 'visibility.anyoneWithLink', hint: 'visibility.anyoneHint', Icon: Globe },
] as const satisfies readonly { value: Visibility; label: string; hint: string; Icon: typeof Lock }[];

interface Props {
  id: string;
  type: ArtifactType | null;
  title: string;
  owner: boolean;
  status: CloudHeaderState;
  published: boolean;
  publishedAt?: string | null;
  onPublish?: () => void;
  visibility: Visibility;
  onChange: (next: Visibility) => void;
  onHistory?: (action: 'toggle' | 'close') => void;
}

export function CloudHeader({ id, type, title, owner, status, visibility, published, publishedAt, onPublish, onChange, onHistory }: Props) {
  const { t } = useTranslation();
  return (
    <header {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.left)}>
        <a href="/" aria-label={t('share.backToList')} {...stylex.props(styles.brand)}>
          <RyugiMark size={24} />
          <span {...stylex.props(styles.name)}>ryugi</span>
        </a>
        <nav aria-label={t('share.breadcrumb')} {...stylex.props(styles.crumb)}>
          <span aria-hidden="true" {...stylex.props(styles.slash)}>/</span>
          {type ? <span {...stylex.props(styles.type)}>{type}<span aria-hidden="true" {...stylex.props(styles.slash)}> / </span></span> : null}
          <span aria-current="page" title={title} {...stylex.props(styles.title)}>{title}</span>
        </nav>
      </div>
      <div {...stylex.props(styles.actions)}>
        {owner ? <PublicationStatus compact publication={status.publication} published={published} /> : null}
        {status.history !== undefined ? <RailSwitch comments={status.comments ?? 0} open={Boolean(status.historyOpen)} available={status.history} onComments={() => onHistory?.('close')} onHistory={() => onHistory?.('toggle')} /> : null}
        <div {...stylex.props(styles.statuses)}>
          {status.activity ? (
            <span
              title={status.activity}
              data-tone={status.activityTone ?? 'live'}
              {...stylex.props(styles.activity, status.activityTone === 'quiet' && styles.activityQuiet, status.activityTone === 'warning' && styles.activityWarning)}
            >
              {status.activity}
            </span>
          ) : null}
          {status.retrying ? <span role="status" {...stylex.props(styles.retrying)}>{t('share.retrying')}</span> : null}
          {status.reason ? <CircleAlert size={14} aria-label={status.reason} /> : null}
          {status.online !== undefined ? (
            <span role="status" title={status.reason || (status.online === false ? t('share.offlineNoComments') : undefined)} {...stylex.props(styles.status)}>
              <i aria-hidden="true" {...stylex.props(styles.dot, status.online === true && styles.online)} />
              {status.online === null ? t('common.connecting') : status.online ? t('share.computerOnline') : t('share.computerOffline')}
            </span>
          ) : null}
          {status.comments !== undefined && status.history === undefined ? <span {...stylex.props(styles.status)}><MessageCircle size={14} aria-hidden="true" />{t('share.comments', { count: status.comments })}</span> : null}
          {(status.online !== undefined || status.comments !== undefined) && owner ? <span aria-hidden="true" {...stylex.props(styles.divider)} /> : null}
        </div>
        {owner ? <OwnerActions id={id} title={title} visibility={visibility} published={published} publishedAt={publishedAt} publication={status.publication} online={status.online} onPublish={onPublish} onChange={onChange} /> : (
          <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.cta)}>
            {t('share.getStarted')}<ArrowRight size={12} />
          </a>
        )}
      </div>
    </header>
  );
}

export function useCloudSharePanel({ id, title = null, visibility, published, publishedAt, publication, online, onPublish, onChange, inline = false }: { id: string; title?: string | null; visibility: Visibility; published: boolean; publishedAt?: string | null; publication?: Publication | null; online?: boolean | null; onPublish?: () => void; onChange: (next: Visibility) => void; inline?: boolean }) {
  const { t } = useTranslation();
  const [error, setError] = useState<{ message: string; auth?: boolean; upgradeUrl?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [page] = usePageQuery();
  const url = pageLink(`${location.origin}/a/${id}`, page);

  const choose = async (next: Visibility) => {
    if (next === visibility || saving) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await changeVisibility(id, next));
    } catch (err) {
      const limit = err instanceof CloudRequestError ? err.limit : undefined;
      if (limit && isSlotLimit(limit)) openPlanLimitDialog({ limit, title, upgradeUrl: (err as CloudRequestError).upgradeUrl ?? '/billing' });
      else if (limit) setError({ message: planLimitMessage(limit), upgradeUrl: limit.kind === 'total' ? undefined : (err as CloudRequestError).upgradeUrl });
      else setError({ message: (err as Error).message, auth: err instanceof CloudRequestError && err.status === 401 });
    }
    setSaving(false);
  };

  const copy = async () => {
    if (!published) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError({ message: t('share.copyFailed') });
    }
  };

  return (
    <div {...stylex.props(styles.panel, inline && styles.panelInline)}>
      <PublicationStatus publication={publication} published={published} publishedAt={publishedAt} online={online} onPublish={onPublish} />
      {inline ? (
        <FormField layout="horizontal" variant="borderless" label={t('visibility.anyoneCanView')} desc={visibility === 'public' ? t('visibility.anyoneHint') : t('visibility.offHint')}>
          <Switch checked={visibility === 'public'} loading={saving} disabled={saving} onChange={(checked) => void choose(checked ? 'public' : 'private')} />
        </FormField>
      ) : (
        <>
          <p {...stylex.props(styles.heading)}>{t('visibility.whoCanSee')}</p>
          <div role="radiogroup" aria-label={t('visibility.whoCanSee')} {...stylex.props(styles.options)}>
            {OPTIONS.map(({ value, label, hint, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === visibility}
                disabled={saving}
                onClick={() => void choose(value)}
                {...stylex.props(styles.option, value === visibility && styles.optionOn)}
              >
                <span {...stylex.props(styles.icon)}>
                  <Icon size={12} />
                </span>
                <span>
                  <span {...stylex.props(styles.label)}>{t(label)}</span>
                  <span {...stylex.props(styles.hint)}>{t(hint)}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div {...stylex.props(styles.link)}>
        <Input aria-label={t('share.linkLabel')} value={published ? url : ''} placeholder={t('publication.linkPending')} readOnly size="small" onFocus={(event) => event.currentTarget.select()} {...stylex.props(styles.url)} />
        <button type="button" disabled={!published} onClick={() => void copy()} {...stylex.props(styles.share, !published && styles.disabled)}><Copy size={12} /> {copied ? t('common.copied') : t('common.copy')}</button>
      </div>
      {error ? <p role="alert" {...stylex.props(styles.error)}>{error.auth ? t('common.sessionExpired') : error.message} {error.auth && <a href={`/auth/login?return=${encodeURIComponent(location.pathname)}`}>{t('common.signInAgain')}</a>}{error.upgradeUrl && <a href={error.upgradeUrl}>{t('common.upgradePro')}</a>}</p> : <p {...stylex.props(styles.foot)}>{published ? <>{visibility === 'private' ? t('share.copyNotPublic') : ''}{t('share.appliesNow')}</> : t('publication.permissionPending')}</p>}
    </div>
  );
}

function OwnerActions({ id, title, visibility, onChange, ...publication }: { id: string; title: string; visibility: Visibility; onChange: (next: Visibility) => void; published: boolean; publishedAt?: string | null; publication?: Publication | null; online?: boolean | null; onPublish?: () => void }) {
  const { t } = useTranslation();
  const panel = useCloudSharePanel({ id, title, visibility, onChange, ...publication });
  const current = OPTIONS.find((option) => option.value === visibility)!;

  return (
    <>
      <span title={t('visibility.chip', { label: t(current.label) })} {...stylex.props(styles.chip)}>
        <current.Icon size={11} />
        <span {...stylex.props(styles.visibilityLabel)}>{t('visibility.chip', { label: t(current.label) })}</span>
      </span>
      <Popover placement="bottomRight" trigger="click" content={panel} popupProps={{ 'aria-label': t('common.share') }}>
        <button type="button" {...stylex.props(styles.share, styles.shareRound)}>
          {t('common.share')}
        </button>
      </Popover>
    </>
  );
}
