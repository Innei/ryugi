import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { RailSwitch } from '../components/RailSwitch';
import { useCloudHeader } from '../hooks/useCloudHeader';
import { activityLabel, type AgentActivity } from './agentActivity';
import type { CloudLive } from './DocumentView';
import { t } from '../i18n';

const styles = stylex.create({
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingInline: 24,
    backgroundColor: cssVar.colorBgContainer,
    fontFamily: cssVar.fontFamily,
  },
  crumb: { color: cssVar.colorTextTertiary, fontSize: 12, whiteSpace: 'nowrap' },
  crumbId: { color: cssVar.colorText, fontWeight: 600 },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBlock: 2,
    paddingInline: 10,
    borderRadius: 999,
    backgroundColor: cssVar.colorInfoBg,
    color: cssVar.colorInfoText,
    fontSize: 11,
    whiteSpace: 'nowrap',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor' },
  quiet: { backgroundColor: cssVar.colorFillTertiary, color: cssVar.colorTextSecondary },
  offline: { backgroundColor: cssVar.colorWarningBg, color: cssVar.colorWarningText },
  host: { display: 'flex', alignItems: 'center', gap: 6, color: cssVar.colorTextSecondary, fontSize: 12, whiteSpace: 'nowrap' },
  hostDot: { width: 7, height: 7, borderRadius: '50%', backgroundColor: cssVar.colorTextQuaternary },
  hostOnline: { backgroundColor: cssVar.colorSuccess },
  reason: { overflow: 'hidden', color: cssVar.colorTextTertiary, fontSize: 12, whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  spacer: { flex: 1 },
  compact: { paddingInline: 16, gap: 10 },
  done: {
    paddingBlock: 4,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: cssVar.colorText,
    color: cssVar.colorBgContainer,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
});

interface Props {
  id: string;
  title?: string;
  agent?: string;
  activity: AgentActivity;
  agentSection: string | null;
  offline: boolean;
  openComments: number;
  cloud?: CloudLive;
  compact?: boolean;
  onDone?: () => void;
  actions?: ReactNode;
  history?: { available: boolean; open: boolean; toggle: () => void; close: () => void };
}

export function TopBar({ id, title, activity, agentSection, offline, openComments, cloud, compact = false, onDone, actions, agent = 'Agent', history }: Props) {
  const label = activityLabel(activity, agent, agentSection);
  const framed = useCloudHeader(id, cloud ? {
    ...(title ? { title } : {}),
    online: cloud.online,
    comments: openComments,
    activity: label,
    activityTone: activity.kind === 'stale' ? 'warning' : activity.kind === 'working' ? 'quiet' : 'live',
    retrying: offline,
    reason: cloud.reason,
    history: history?.available,
    historyOpen: history?.open,
  } : null);
  if (framed && !compact) return null;
  return (
    <header {...stylex.props(styles.bar, compact && styles.compact)}>
      {compact ? null : (
        <span {...stylex.props(styles.crumb)}>
          document / <span {...stylex.props(styles.crumbId)}>{id}</span>
        </span>
      )}
      {label ? (
        <span {...stylex.props(styles.pill, activity.kind === 'working' && styles.quiet, activity.kind === 'stale' && styles.offline)}>
          {activity.kind === 'stale' ? null : <i {...stylex.props(styles.dot)} />}
          {label}
        </span>
      ) : null}
      {offline ? <span {...stylex.props(styles.pill, styles.offline)}>{t('document.notSynced')}</span> : null}
      {history?.open ? <span {...stylex.props(styles.pill, styles.quiet)}><Lock size={11} aria-hidden="true" />{t('document.readOnlyHistory')}</span> : null}
      {cloud?.reason && !compact ? <span {...stylex.props(styles.reason)}>{cloud.reason}</span> : null}
      <span {...stylex.props(styles.spacer)} />
      {cloud ? (
        <span {...stylex.props(styles.host)}>
          <i {...stylex.props(styles.hostDot, cloud.online && styles.hostOnline)} />
          {cloud.online ? t('share.computerOnline') : t('share.computerOffline')}
        </span>
      ) : null}
      {history ? <RailSwitch comments={openComments} open={history.open} available={history.available} onComments={history.close} onHistory={history.toggle} /> : null}
      {onDone ? (
        <button type="button" onClick={onDone} {...stylex.props(styles.done)}>
          {t('common.done')}
        </button>
      ) : cloud || compact ? null : actions}
    </header>
  );
}
