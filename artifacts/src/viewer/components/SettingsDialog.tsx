import { Avatar, Button, Modal, Segmented, Switch } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import type { CloudStatus } from '../../shared/cloud';
import { cloudRequest, useCloudStatus } from '../hooks/useCloudStatus';
import { useTranslation } from '../i18n';
import { closeSettings, useSettingsOpen } from '../lib/settings-dialog';

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    color: cssVar.colorText,
  },
  heading: { margin: 0, fontSize: 13, fontWeight: 600, color: cssVar.colorTextSecondary },
  card: {
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 10,
  },
  row: { display: 'flex', alignItems: 'center', gap: 14, paddingBlock: 12, paddingInline: 14 },
  divided: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
  },
  text: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  label: { fontWeight: 600 },
  hint: { color: cssVar.colorTextSecondary, fontSize: 12, lineHeight: 1.6 },
});

type AutoPublishChange =
  { scope: 'global'; value: boolean } | { scope: 'project'; value: boolean | null };

const PROJECT_VALUES = { inherit: null, on: true, off: false } as const;
type ProjectChoice = keyof typeof PROJECT_VALUES;

const projectChoice = (value: boolean | null | undefined): ProjectChoice =>
  value === true ? 'on' : value === false ? 'off' : 'inherit';

interface PanelProps {
  onAutoPublish: (change: AutoPublishChange) => Promise<void>;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
  project: string;
  status: CloudStatus;
  waitingForLogin: boolean;
}

export function SettingsPanel({
  status,
  project,
  waitingForLogin,
  onAutoPublish,
  onSignIn,
  onSignOut,
}: PanelProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    await task();
    setBusy(false);
  };

  if (!status.signedIn || !status.login)
    return (
      <div {...stylex.props(styles.panel)}>
        <h3 {...stylex.props(styles.heading)}>{t('settings.cloud')}</h3>
        <div {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.text, styles.hint)}>{t('settings.signedOut')}</span>
            <Button loading={waitingForLogin} type="primary" onClick={onSignIn}>
              {waitingForLogin ? t('settings.waitingLogin') : t('common.signInGithub')}
            </Button>
          </div>
        </div>
      </div>
    );

  const login = status.login;
  return (
    <div {...stylex.props(styles.panel)}>
      <h3 {...stylex.props(styles.heading)}>{t('settings.cloud')}</h3>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.row)}>
          <Avatar alt="" avatar={`/api/avatar/github/${login}`} shape="circle" size={32} />
          <span {...stylex.props(styles.text)}>
            <span {...stylex.props(styles.label)}>{login}</span>
            <span {...stylex.props(styles.hint)}>{t('settings.signedInAs', { login })}</span>
          </span>
          <Button disabled={busy} size="small" onClick={() => void run(onSignOut)}>
            {t('settings.signOut')}
          </Button>
        </div>
      </div>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.text)}>
            <span {...stylex.props(styles.label)}>{t('settings.autoPublish')}</span>
            <span {...stylex.props(styles.hint)}>{t('settings.autoPublishHint')}</span>
          </span>
          <Switch
            aria-label={t('settings.autoPublish')}
            checked={!!status.autoPublish?.global}
            disabled={busy}
            onChange={(checked) =>
              void run(() => onAutoPublish({ scope: 'global', value: checked }))
            }
          />
        </div>
        <div {...stylex.props(styles.row, styles.divided)}>
          <span {...stylex.props(styles.text)}>
            <span {...stylex.props(styles.label)}>
              {t('settings.projectOverride', { project })}
            </span>
            <span {...stylex.props(styles.hint)}>{t('settings.projectOverrideHint')}</span>
          </span>
          <Segmented<ProjectChoice>
            disabled={busy}
            size="small"
            value={projectChoice(status.autoPublish?.project)}
            options={[
              { label: t('settings.inherit'), value: 'inherit' },
              { label: t('settings.on'), value: 'on' },
              { label: t('settings.off'), value: 'off' },
            ]}
            onChange={(choice) =>
              void run(() => onAutoPublish({ scope: 'project', value: PROJECT_VALUES[choice] }))
            }
          />
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const { t } = useTranslation();
  const open = useSettingsOpen();
  const { status, refresh, login, waitingForLogin } = useCloudStatus();
  const [project, setProject] = useState('');

  useEffect(() => {
    if (!open) return;
    void refresh();
    const controller = new AbortController();
    void fetch('/api/artifacts', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ project: string }>) : null))
      .then((list) => setProject(list?.project ?? ''))
      .catch(() => {});
    return () => controller.abort();
  }, [open, refresh]);

  return (
    <Modal
      footer={null}
      open={open}
      title={t('settings.title')}
      width={560}
      onCancel={closeSettings}
    >
      {status ? (
        <SettingsPanel
          project={project || t('common.project')}
          status={status}
          waitingForLogin={waitingForLogin}
          onSignIn={() => void login()}
          onAutoPublish={async (change) => {
            await cloudRequest('POST', 'auto-publish', change);
            await refresh();
          }}
          onSignOut={async () => {
            await cloudRequest('POST', 'logout');
            await refresh();
          }}
        />
      ) : null}
    </Modal>
  );
}
