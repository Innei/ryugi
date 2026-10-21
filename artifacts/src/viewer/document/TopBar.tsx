import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { PublishMenu } from '../components/PublishMenu';
import { useCloudHeader } from '../hooks/useCloudHeader';
import type { CloudLive } from './DocumentPage';

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
  },
  dot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor' },
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
  agentEditing: boolean;
  agentSection: string | null;
  offline: boolean;
  openComments: number;
  cloud?: CloudLive;
  compact?: boolean;
  onDone?: () => void;
}

export function TopBar({ id, title, agentEditing, agentSection, offline, openComments, cloud, compact = false, onDone, agent = 'Agent' }: Props) {
  const framed = useCloudHeader(id, cloud ? {
    ...(title ? { title } : {}),
    online: cloud.online,
    comments: openComments,
    activity: agentEditing ? `${agent} 正在编辑${agentSection ? ` ${agentSection}` : ''}` : null,
    retrying: offline,
    reason: cloud.reason,
  } : null);
  if (framed && !compact) return null;
  return (
    <header {...stylex.props(styles.bar, compact && styles.compact)}>
      {compact ? null : (
        <span {...stylex.props(styles.crumb)}>
          document / <span {...stylex.props(styles.crumbId)}>{id}</span>
        </span>
      )}
      {agentEditing ? (
        <span {...stylex.props(styles.pill)}>
          <i {...stylex.props(styles.dot)} />
          {agent} 正在编辑{agentSection ? ` ${agentSection}` : ''}
        </span>
      ) : null}
      {offline ? <span {...stylex.props(styles.pill, styles.offline)}>未同步，正在重试</span> : null}
      {cloud?.reason && !compact ? <span {...stylex.props(styles.reason)}>{cloud.reason}</span> : null}
      <span {...stylex.props(styles.spacer)} />
      {cloud ? (
        <span {...stylex.props(styles.host)}>
          <i {...stylex.props(styles.hostDot, cloud.online && styles.hostOnline)} />
          {cloud.online ? '电脑在线' : '电脑离线'}
        </span>
      ) : null}
      {compact ? null : <span {...stylex.props(styles.crumb)}>评论 {openComments}</span>}
      {onDone ? (
        <button type="button" onClick={onDone} {...stylex.props(styles.done)}>
          完成
        </button>
      ) : cloud || compact ? null : (
        <PublishMenu artifact={`document/${id}`} />
      )}
    </header>
  );
}
