import { Button, CopyButton, Popover, Segmented } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Globe, Lock } from 'lucide-react';
import { useState } from 'react';

import { ownLink, publishing, publishState, syncNote, type Visibility } from '../../shared/cloud';
import { cloudRequest, type CloudResult, useCloudStatus } from '../hooks/useCloudStatus';
import { useCloudSync } from '../hooks/useCloudSync';
import { pageLink, usePageQuery } from '../hooks/usePageQuery';
import { usePublication } from '../hooks/usePublication';
import { useTranslation } from '../i18n';
import { responseErrorText } from '../lib/error-text';
import { PublicationStatus } from './PublicationStatus';

const styles = stylex.create({
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 8,
    backgroundColor: { 'default': cssVar.colorBgElevated, ':hover': cssVar.colorFillTertiary },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  floating: {
    position: 'fixed',
    top: 12,
    right: 12,
    zIndex: 10,
    boxShadow: cssVar.boxShadowTertiary,
  },
  dot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: cssVar.colorWarning },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: 320,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  muted: { color: cssVar.colorTextSecondary, lineHeight: 1.6 },
  link: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    color: cssVar.colorLink,
  },
  textButton: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextTertiary,
    fontSize: 11,
    cursor: 'pointer',
  },
  danger: { color: cssVar.colorError },
  error: { margin: 0, paddingInlineStart: 18, color: cssVar.colorError, lineHeight: 1.6 },
  warning: { color: cssVar.colorWarningText },
});

const VISIBILITY_HINT = { private: 'publish.hintPrivate', public: 'publish.hintPublic' } as const;

interface Props {
  artifact: string;
  floating?: boolean;
}

export function PublishMenu({ artifact, floating = false }: Props) {
  const { t } = useTranslation();
  const { status, refresh, login, waitingForLogin } = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const entry = status?.artifacts[artifact];
  const state = publishState(entry);
  const publication = usePublication(artifact, !!status?.signedIn);
  const uploading = publication && publishing(publication.phase);
  const [page] = usePageQuery();
  const shareUrl = state.url ? pageLink(state.url, page) : null;
  const sync = useCloudSync(artifact, !!status?.signedIn && state.published);
  const note = syncNote(
    sync.upToDate,
    !!status?.autoPublish?.enabled && entry?.autoPublish !== false,
  );

  const run = async (action: () => Promise<CloudResult>) => {
    setBusy(true);
    setErrors([]);
    const result = await action();
    if (result.status === 401) void login(result.json.loginUrl as string | undefined);
    else if (!result.ok) {
      const reasons = Array.isArray(result.json.reasons) ? (result.json.reasons as string[]) : [];
      setErrors([
        responseErrorText(result.json, t('common.requestFailed', { status: result.status })),
        ...reasons,
      ]);
    }
    await Promise.all([refresh(), sync.refresh()]);
    setBusy(false);
  };

  const setVisibility = (visibility: Visibility) =>
    run(() => cloudRequest('POST', `visibility/${artifact}`, { visibility }));

  const adoptCloudVisibility = async (open: boolean) => {
    if (!open || !status?.signedIn || !state.published) return;
    void sync.refresh();
    if ((await cloudRequest('GET', 'artifacts')).ok) await refresh();
  };

  const content = !status ? (
    <div {...stylex.props(styles.panel, styles.muted)}>{t('publish.readingStatus')}</div>
  ) : !status.signedIn ? (
    <div {...stylex.props(styles.panel)}>
      <span {...stylex.props(styles.muted)}>{t('publish.signInPrompt')}</span>
      <Button loading={waitingForLogin} type="primary" onClick={() => void login()}>
        {waitingForLogin ? t('publish.waitingLogin') : t('common.signInGithub')}
      </Button>
    </div>
  ) : (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.muted)}>
          {t('publish.signedInAs', { login: status.login })}
        </span>
        <button
          type="button"
          {...stylex.props(styles.textButton)}
          onClick={() => void run(() => cloudRequest('POST', 'logout'))}
        >
          {t('publish.signOut')}
        </button>
      </div>
      <PublicationStatus
        online
        busy={busy}
        publication={publication}
        published={state.published}
        publishedAt={entry?.cloud?.publishedAt}
        onPublish={() => void run(() => cloudRequest('POST', `publish/${artifact}`))}
      />
      <Segmented
        block
        disabled={busy}
        value={state.visibility}
        options={[
          { label: t('visibility.private'), value: 'private' },
          { label: t('visibility.public'), value: 'public' },
        ]}
        onChange={(value) => void setVisibility(value as Visibility)}
      />
      <span {...stylex.props(styles.muted)}>{t(VISIBILITY_HINT[state.visibility])}</span>
      {shareUrl ? (
        <div {...stylex.props(styles.row)}>
          <a
            href={ownLink(shareUrl, status.hostId)}
            rel="noreferrer"
            target="_blank"
            {...stylex.props(styles.link)}
          >
            {shareUrl}
          </a>
          <CopyButton content={shareUrl} size="small" />
        </div>
      ) : null}
      {note ? (
        <span {...stylex.props(sync.upToDate ? styles.muted : styles.warning)}>
          {t(`publish.${note}`)}
        </span>
      ) : null}
      {!state.synced ? (
        <div {...stylex.props(styles.row, styles.warning)}>
          <span>{t('publish.visibilityNotSynced')}</span>
          <Button disabled={busy} size="small" onClick={() => void setVisibility(state.visibility)}>
            {t('publish.sync')}
          </Button>
        </div>
      ) : null}
      {errors.length > 0 ? (
        <ul {...stylex.props(styles.error)}>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {state.published && (!publication || publication.phase === 'published') ? (
        <Button
          loading={busy || !!uploading}
          type="primary"
          onClick={() => void run(() => cloudRequest('POST', `publish/${artifact}`))}
        >
          {t('publish.update')}
        </Button>
      ) : null}
      {state.published ? (
        <button
          disabled={busy}
          type="button"
          {...stylex.props(styles.textButton, styles.danger)}
          onClick={() => void run(() => cloudRequest('DELETE', `publish/${artifact}`))}
        >
          {t('publish.unpublish')}
        </button>
      ) : null}
      {state.published && status.autoPublish?.enabled ? (
        <span {...stylex.props(styles.muted)}>{t('publish.autoPublishNote')}</span>
      ) : null}
    </div>
  );

  return (
    <Popover
      content={content}
      placement="bottomRight"
      popupProps={{ 'aria-label': t('common.share') }}
      trigger="click"
      onOpenChange={(open) => void adoptCloudVisibility(open)}
    >
      <button
        aria-label="Share"
        type="button"
        {...stylex.props(styles.trigger, floating && styles.floating)}
      >
        {state.published && state.visibility === 'public' ? (
          <Globe size={14} />
        ) : (
          <Lock size={14} />
        )}
        {state.published ? t('publish.published') : t('common.share')}
        {publication && publication.phase !== 'published' ? (
          <PublicationStatus compact publication={publication} published={state.published} />
        ) : null}
        {sync.upToDate === false ? (
          <span aria-label={t('publish.unpublishedChanges')} {...stylex.props(styles.dot)} />
        ) : null}
      </button>
    </Popover>
  );
}
