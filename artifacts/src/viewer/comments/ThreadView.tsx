import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, RotateCcw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { waitingOn, type Message, type Thread } from '../../shared/comments';
import { authorOf } from '../document/author';
import { Avatar } from '../document/Avatar';
import { Composer } from '../document/Composer';
import { i18n, useTranslation } from '../i18n';

export interface ThreadActions {
  reply(threadId: string, text: string): void | Promise<boolean>;
  edit(threadId: string, messageId: string, text: string): void;
  remove(threadId: string, messageId: string): void;
  resolve(threadId: string): void;
  reopen(threadId: string): void;
}

const styles = stylex.create({
  thread: { fontFamily: cssVar.fontFamily, fontSize: 12, lineHeight: 1.6, color: cssVar.colorText, cursor: 'default' },
  head: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, paddingInline: 14, fontSize: 11 },
  label: { flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: cssVar.colorTextTertiary },
  body: { paddingBlock: 10, paddingInline: 14 },
  message: { marginTop: { default: 12, ':first-child': 0 } },
  who: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, marginBottom: 2 },
  time: { color: cssVar.colorTextQuaternary, fontWeight: 400 },
  deleted: { color: cssVar.colorTextQuaternary, fontStyle: 'italic' },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  small: { marginInlineStart: 'auto', display: 'flex', gap: 6 },
  link: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText }, fontSize: 11, cursor: 'pointer' },
  icon: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: { default: 'transparent', ':hover': cssVar.colorFillTertiary },
    color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText },
    fontSize: 12,
    cursor: 'pointer',
  },
  badge: { flexShrink: 0, paddingBlock: 1, paddingInline: 8, borderRadius: 999, fontSize: 10 },
  badgeHuman: { backgroundColor: cssVar.colorWarningBg, color: cssVar.colorWarningText },
  badgeAgent: { backgroundColor: cssVar.colorInfoBg, color: cssVar.colorInfoText },
});

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

export function MessageView({ message, onEdit, onDelete }: { message: Message; onEdit?: (text: string) => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const human = message.author === 'human';
  const { label, initial } = authorOf(message);
  return (
    <div {...stylex.props(styles.message)}>
      <div {...stylex.props(styles.who)}>
        <Avatar human={human} initial={initial} name={message.name} src={message.avatar} />
        {label} <span {...stylex.props(styles.time)}>{timeOf(message.editedAt ?? message.at)}</span>
        {human && onEdit && onDelete && !message.deleted && !editing ? (
          <span {...stylex.props(styles.small)}>
            <button type="button" onClick={() => setEditing(true)} {...stylex.props(styles.link)}>{t('common.edit')}</button>
            <button type="button" onClick={onDelete} {...stylex.props(styles.link)}>{t('common.delete')}</button>
          </span>
        ) : null}
      </div>
      {message.deleted ? (
        <div {...stylex.props(styles.deleted)}>{t('common.deleted')}</div>
      ) : editing ? (
        <Composer autoFocus initial={message.text} placeholder="" onSubmit={(text) => (onEdit?.(text), setEditing(false))} onCancel={() => setEditing(false)} />
      ) : (
        <div {...stylex.props(styles.text)}>{message.text}</div>
      )}
    </div>
  );
}

export function WaitingText({ thread, agent = 'Agent' }: { thread: Thread<unknown>; agent?: string }) {
  const waiting = waitingOn(thread);
  if (waiting === 'human') return <span {...stylex.props(styles.badge, styles.badgeHuman)}>{i18n.t('comments.waitingYou')}</span>;
  if (waiting === 'agent') return <span title={i18n.t('comments.agentReadsNext', { agent })} {...stylex.props(styles.badge, styles.badgeAgent)}>{i18n.t('comments.waitingAgent', { agent })}</span>;
  return null;
}

export function ThreadMessages({ thread, actions }: { thread: Thread<unknown>; actions?: ThreadActions }) {
  return (
    <div {...stylex.props(styles.body)}>
      {thread.messages.map((message) => (
        <MessageView
          key={message.id}
          message={message}
          onEdit={actions && ((text) => actions.edit(thread.id, message.id, text))}
          onDelete={actions && (() => actions.remove(thread.id, message.id))}
        />
      ))}
    </div>
  );
}

interface Props {
  thread: Thread<unknown>;
  label: ReactNode;
  actions?: ThreadActions;
  agent?: string;
  onClose?: () => void;
}

export function ThreadView({ thread, label, actions, agent, onClose }: Props) {
  const { t } = useTranslation();
  const resolved = thread.status === 'resolved';
  return (
    <div {...stylex.props(styles.thread)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.label)}>{label}</span>
        {actions ? <WaitingText thread={thread} agent={agent} /> : null}
        {actions ? (
          resolved ? (
            <button type="button" title={t('common.reopen')} onClick={() => actions.reopen(thread.id)} {...stylex.props(styles.icon)}>
              <RotateCcw size={13} strokeWidth={2.2} />
            </button>
          ) : (
            <button type="button" title={t('common.markResolved')} onClick={() => actions.resolve(thread.id)} {...stylex.props(styles.icon)}>
              <Check size={14} strokeWidth={2.4} />
            </button>
          )
        ) : null}
        {onClose ? (
          <button type="button" title={t('common.close')} onClick={onClose} {...stylex.props(styles.icon)}>
            <X size={13} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      <ThreadMessages thread={thread} actions={actions} />
      {actions && !resolved ? (
        <Composer placeholder={t('common.reply')} onSubmit={(text) => actions.reply(thread.id, text)} onCancel={onClose} />
      ) : null}
    </div>
  );
}
