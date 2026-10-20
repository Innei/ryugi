import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { waitingOn, type Message, type Thread } from '../../shared/comments';

const styles = stylex.create({
  panel: {
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: cssVar.colorFillQuaternary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    lineHeight: 1.6,
    color: cssVar.colorText,
    cursor: 'default',
  },
  active: { backgroundColor: cssVar.colorBgElevated, boxShadow: cssVar.boxShadowSecondary },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingInline: 14,
    fontSize: 11,
  },
  quote: { flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: cssVar.colorWarningText },
  badge: { flexShrink: 0, paddingBlock: 1, paddingInline: 8, borderRadius: 999, fontSize: 10 },
  badgeHuman: { backgroundColor: cssVar.colorWarningBg, color: cssVar.colorWarningText },
  badgeAgent: { backgroundColor: cssVar.colorInfoBg, color: cssVar.colorInfoText },
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
  body: { paddingBlock: 10, paddingInline: 14 },
  message: { marginTop: { default: 12, ':first-child': 0 } },
  who: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, marginBottom: 2 },
  avatar: { width: 20, height: 20, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10 },
  human: { backgroundColor: '#c46a3b' },
  agent: { backgroundColor: '#7c5cff' },
  time: { color: cssVar.colorTextQuaternary, fontWeight: 400 },
  deleted: { color: cssVar.colorTextQuaternary, fontStyle: 'italic' },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  small: { marginInlineStart: 'auto', display: 'flex', gap: 6 },
  link: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText }, fontSize: 11, cursor: 'pointer' },
  composer: { position: 'relative', paddingTop: 2, paddingInline: 14, paddingBottom: 12 },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
    padding: 0,
    paddingInlineEnd: 36,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    lineHeight: 1.6,
    resize: 'none',
    fieldSizing: 'content',
  },
  send: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    borderRadius: '50%',
    backgroundColor: cssVar.colorText,
    color: cssVar.colorBgContainer,
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.35 },
  },
  collapsed: { display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 8, paddingInline: 12, color: cssVar.colorTextTertiary, cursor: 'pointer' },
});

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface ComposerProps {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  onChange?: (text: string) => void;
}

export function Composer({ placeholder, initial = '', autoFocus, onSubmit, onCancel, onChange }: ComposerProps) {
  const [text, setText] = useState(initial);
  const update = (next: string) => {
    setText(next);
    onChange?.(next);
  };
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    update('');
  };
  return (
    <div {...stylex.props(styles.composer)} onClick={(event) => event.stopPropagation()}>
      <textarea
        autoFocus={autoFocus}
        value={text}
        rows={1}
        placeholder={placeholder}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
          if (event.key === 'Escape') onCancel?.();
        }}
        {...stylex.props(styles.input)}
      />
      <button type="button" aria-label="发送" title="发送 ⌘↵" disabled={!text.trim()} onClick={submit} {...stylex.props(styles.send)}>
        <ArrowUp size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function Avatar({ human }: { human: boolean }) {
  return <span {...stylex.props(styles.avatar, human ? styles.human : styles.agent)}>{human ? '你' : 'A'}</span>;
}

export function PanelFrame({ active, children }: { active?: boolean; children: ReactNode }) {
  return <div {...stylex.props(styles.panel, active && styles.active)}>{children}</div>;
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.body)}>{children}</div>;
}

export function PanelWho({ human, label }: { human: boolean; label: string }) {
  return (
    <div {...stylex.props(styles.who)}>
      <Avatar human={human} />
      {label}
    </div>
  );
}

function MessageView({ message, onEdit, onDelete }: { message: Message; onEdit: (text: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const human = message.author === 'human';
  return (
    <div {...stylex.props(styles.message)}>
      <div {...stylex.props(styles.who)}>
        <Avatar human={human} />
        {human ? '你' : 'Agent'} <span {...stylex.props(styles.time)}>{timeOf(message.editedAt ?? message.at)}</span>
        {human && !message.deleted && !editing ? (
          <span {...stylex.props(styles.small)}>
            <button type="button" onClick={() => setEditing(true)} {...stylex.props(styles.link)}>编辑</button>
            <button type="button" onClick={onDelete} {...stylex.props(styles.link)}>删除</button>
          </span>
        ) : null}
      </div>
      {message.deleted ? (
        <div {...stylex.props(styles.deleted)}>已删除</div>
      ) : editing ? (
        <Composer autoFocus initial={message.text} placeholder="" onSubmit={(text) => (onEdit(text), setEditing(false))} onCancel={() => setEditing(false)} />
      ) : (
        <div {...stylex.props(styles.text)}>{message.text}</div>
      )}
    </div>
  );
}

export interface ThreadActions {
  reply(threadId: string, text: string): void;
  edit(threadId: string, messageId: string, text: string): void;
  remove(threadId: string, messageId: string): void;
  resolve(threadId: string): void;
  reopen(threadId: string): void;
}

export function CommentCard({ thread, active, actions, onActivate }: { thread: Thread; active: boolean; actions: ThreadActions; onActivate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const waiting = waitingOn(thread);
  const resolved = thread.status === 'resolved';
  const quote = thread.anchor.quote || '整段';

  if (resolved && !expanded) {
    return (
      <PanelFrame>
        <div onClick={() => setExpanded(true)} {...stylex.props(styles.collapsed)}>
          ✓ 已解决 · <span {...stylex.props(styles.quote)}>{quote}</span>
        </div>
      </PanelFrame>
    );
  }

  return (
    <div onClick={onActivate}>
      <PanelFrame active={active}>
        <div {...stylex.props(styles.bar)}>
          <span {...stylex.props(styles.quote)}>{quote}</span>
          {waiting === 'human' ? <span {...stylex.props(styles.badge, styles.badgeHuman)}>等你回复</span> : null}
          {waiting === 'agent' ? (
            <span title="Agent 下一轮会读到这条" {...stylex.props(styles.badge, styles.badgeAgent)}>等 Agent</span>
          ) : null}
          {resolved ? (
            <button type="button" title="重新打开" onClick={() => (actions.reopen(thread.id), setExpanded(false))} {...stylex.props(styles.icon)}>↺</button>
          ) : (
            <button type="button" title="标为已解决" onClick={(event) => (event.stopPropagation(), actions.resolve(thread.id))} {...stylex.props(styles.icon)}>✓</button>
          )}
        </div>
        <div {...stylex.props(styles.body)}>
          {thread.messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              onEdit={(text) => actions.edit(thread.id, message.id, text)}
              onDelete={() => actions.remove(thread.id, message.id)}
            />
          ))}
        </div>
        {active && !resolved ? <Composer placeholder="回复…" onSubmit={(text) => actions.reply(thread.id, text)} /> : null}
      </PanelFrame>
    </div>
  );
}
