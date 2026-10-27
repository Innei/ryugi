import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

import { type Thread, waitingOn } from '../../shared/comments';
import { t } from '../i18n';
import { authorOf } from './author';
import { Avatar } from './Avatar';
import type { ThreadActions } from './CommentCard';
import { Composer } from './Composer';

const styles = stylex.create({
  thread: {
    paddingBlock: 14,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    fontFamily: cssVar.fontFamily,
    color: cssVar.colorText,
  },
  active: { scrollMarginTop: 8 },
  quote: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: '#e8c24a',
    fontSize: 13,
  },
  quoteText: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: cssVar.colorTextSecondary,
  },
  state: { flexShrink: 0, fontSize: 12 },
  waitingAgent: { color: cssVar.colorWarningText },
  answered: { color: cssVar.colorSuccessText },
  resolved: { color: cssVar.colorTextTertiary },
  message: { marginTop: 12 },
  who: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 },
  time: { color: cssVar.colorTextTertiary, fontWeight: 400, fontSize: 12 },
  text: {
    marginTop: 4,
    paddingLeft: 28,
    fontSize: 15,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  deleted: { color: cssVar.colorTextQuaternary },
  footer: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, paddingLeft: 28 },
  reply: {
    flex: 1,
    minWidth: 0,
    marginInline: -14,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorder,
  },
  action: {
    flexShrink: 0,
    minHeight: 44,
    paddingBlock: 0,
    paddingInline: 8,
    marginInlineEnd: -8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    cursor: 'pointer',
  },
});

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  actions?: ThreadActions;
  active?: boolean;
  agent?: string;
  offline?: boolean;
  thread: Thread;
}

export function PhoneThread({
  thread,
  agent = 'Agent',
  actions,
  active = false,
  offline = false,
}: Props) {
  const waiting = waitingOn(thread);
  const resolved = thread.status === 'resolved';
  const state = resolved
    ? { label: t('common.resolved'), tone: styles.resolved }
    : waiting === 'agent'
      ? { label: t('document.waitingAgentReply', { agent }), tone: styles.waitingAgent }
      : waiting === 'human'
        ? { label: t('document.agentReplied', { agent }), tone: styles.answered }
        : null;

  return (
    <div data-thread={thread.id} {...stylex.props(styles.thread, active && styles.active)}>
      <div {...stylex.props(styles.quote)}>
        <span {...stylex.props(styles.quoteText)}>
          {thread.anchor.quote || t('document.wholeBlock')}
        </span>
        {state ? <span {...stylex.props(styles.state, state.tone)}>{state.label}</span> : null}
      </div>
      {resolved && !active
        ? null
        : thread.messages.map((message) => {
            const { label, initial } = authorOf(message);
            return (
              <div key={message.id} {...stylex.props(styles.message)}>
                <div {...stylex.props(styles.who)}>
                  <Avatar
                    human={message.author === 'human'}
                    initial={initial}
                    name={message.name}
                    src={message.avatar}
                  />
                  {label}
                  <span {...stylex.props(styles.time)}>
                    {timeOf(message.editedAt ?? message.at)}
                  </span>
                </div>
                <div {...stylex.props(styles.text, message.deleted && styles.deleted)}>
                  {message.deleted ? t('common.deleted') : message.text}
                </div>
              </div>
            );
          })}
      {actions ? (
        <div {...stylex.props(styles.footer)}>
          {resolved ? null : (
            <div {...stylex.props(styles.reply)}>
              <Composer
                placeholder={t('common.reply')}
                onSubmit={(text) => actions.reply(thread.id, text)}
              />
            </div>
          )}
          {offline ? null : (
            <button
              type="button"
              onClick={() => (resolved ? actions.reopen(thread.id) : actions.resolve(thread.id))}
              {...stylex.props(styles.action)}
            >
              {resolved ? t('common.reopen') : t('common.resolve')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
