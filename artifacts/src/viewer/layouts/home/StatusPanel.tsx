import { Button, toast } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import { useState } from 'react';

import type { HubProjectStatus, HubStatus } from '../../../shared/hub';
import { useTranslation } from '../../i18n';
import { ServerLog } from './ServerLog';
import { addressOf, formatUptime, hubAction } from './status-format';
import { statusStyles as styles } from './status-styles';

export function StatusPanel({ status, onChanged }: { status: HubStatus; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [notice, setNotice] = useState<{ pid: number; text: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  const run = (path: string, text: string, init?: RequestInit) =>
    hubAction(path, init)
      .then(() => {
        if (text) setNotice({ pid: status.pid, text });
        onChanged();
      })
      .catch((error: Error) => toast.error(t('common.requestFailed', { status: error.message })));

  const remove = (project: HubProjectStatus) =>
    void run('/api/hub/projects', '', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: project.dir }),
    });

  const relay = status.relay.connected
    ? t('server.relayAnnounced', { count: status.relay.announced })
    : t('server.relayNotConnected');

  return (
    <>
      <dl {...stylex.props(styles.rows)}>
        <dt {...stylex.props(styles.term)}>{t('server.status')}</dt>
        <dd {...stylex.props(styles.value)}>
          {t('server.running', {
            time: formatUptime(Date.now() - status.startedAt, i18n.language),
          })}
        </dd>
        <dt {...stylex.props(styles.term)}>{t('server.address')}</dt>
        <dd {...stylex.props(styles.value)}>{addressOf(status.url)}</dd>
        <dt {...stylex.props(styles.term)}>{t('server.relay')}</dt>
        <dd {...stylex.props(styles.value)}>{relay}</dd>
        <dt {...stylex.props(styles.term)}>{t('server.livePages')}</dt>
        <dd {...stylex.props(styles.value)}>
          {t('server.liveCounts', { local: status.live.local, relay: status.live.relay })}
        </dd>
      </dl>
      {status.latest && (
        <div {...stylex.props(styles.update)}>
          <span>{t('server.newVersion', { version: status.latest })}</span>
          <Button
            size="small"
            type="primary"
            onClick={() => void run('/api/hub/upgrade', t('server.restarting'))}
          >
            {t('server.upgrade')}
          </Button>
        </div>
      )}
      <h3 {...stylex.props(styles.section)}>
        {t('server.projects')} · {status.projects.length}
      </h3>
      {status.projects.map((project) => (
        <div key={project.dir} title={project.dir} {...stylex.props(styles.project)}>
          <span {...stylex.props(styles.projectName)}>{project.name}</span>
          <span {...stylex.props(styles.projectMeta)}>
            {project.dormant ? t('server.dormant') : t('server.active')} · {project.artifacts}
          </span>
          <Button
            aria-label={t('server.remove', { name: project.name })}
            icon={<X size={12} />}
            size="small"
            type="text"
            onClick={() => remove(project)}
          />
        </div>
      ))}
      <div {...stylex.props(styles.actions)}>
        <Button size="small" onClick={() => setShowLog((open) => !open)}>
          {showLog ? t('server.hideLog') : t('server.viewLog')}
        </Button>
        <div {...stylex.props(styles.controls)}>
          <Button size="small" onClick={() => void run('/api/hub/restart', t('server.restarting'))}>
            {t('server.restart')}
          </Button>
          <Button
            danger
            size="small"
            onClick={() => void run('/api/hub/stop', t('server.stopped'))}
          >
            {t('server.stop')}
          </Button>
        </div>
      </div>
      {notice && notice.pid === status.pid && (
        <p role="status" {...stylex.props(styles.notice)}>
          {notice.text}
        </p>
      )}
      {showLog && <ServerLog projects={status.projects} />}
    </>
  );
}
