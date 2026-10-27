import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Thread } from '../../shared/comments';
import { ThreadMessages, WaitingText, type ThreadActions } from '../comments/ThreadView';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { play } from './motion';
import { useFold, useReplyPresence } from './useCardMotion';
import { t } from '../i18n';

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
  quote: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: cssVar.colorWarningText,
  },
  icon: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: { 'default': 'transparent', ':hover': cssVar.colorFillTertiary },
    color: { 'default': cssVar.colorTextTertiary, ':hover': cssVar.colorText },
    fontSize: 12,
    cursor: 'pointer',
  },
  body: { paddingBlock: 10, paddingInline: 14 },
  who: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 2,
  },
  replyBox: { overflow: 'hidden' },
  collapsed: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBlock: 8,
    paddingInline: 12,
    color: cssVar.colorTextTertiary,
    cursor: 'pointer',
  },
});

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

export type { ThreadActions };

const CONFIRMED = { backgroundColor: '#2ea043', color: '#fff' };

export function CommentCard({
  thread,
  active,
  actions,
  onActivate,
  agent = 'Agent',
}: {
  thread: Thread;
  active: boolean;
  actions?: ThreadActions;
  onActivate: () => void;
  agent?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [focusReply, setFocusReply] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const resolved = thread.status === 'resolved';
  const folded = (resolved || closing) && !expanded;
  const quote = thread.anchor.quote || t('document.wholeBlock');
  const frame = useFold(folded);
  const reply = useReplyPresence(!!actions && active && !resolved && !closing);

  useEffect(() => {
    if (thread.status !== 'open') return;
    setExpanded(false);
    setClosing(false);
  }, [thread.status]);

  const resolve = async (button: HTMLElement) => {
    if (confirming) return;
    setConfirming(true);
    await play(
      button,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.2)', offset: 0.23 },
        { transform: 'scale(1)', offset: 0.52 },
        { transform: 'scale(1)' },
      ],
      {
        duration: 420,
        easing: 'ease-out',
      },
    );
    await play(content.current, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      easing: 'ease-out',
    });
    flushSync(() => {
      setClosing(true);
      setExpanded(false);
      setConfirming(false);
    });
    actions?.resolve(thread.id);
  };

  const unfold = async () => {
    onActivate();
    await play(row.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-in' });
    flushSync(() => setExpanded(true));
  };

  return (
    <div ref={frame}>
      {folded ? (
        <PanelFrame>
          <div ref={row} onClick={() => void unfold()} {...stylex.props(styles.collapsed)}>
            <Check size={13} strokeWidth={2.2} />
            {t('common.resolved')} · <span {...stylex.props(styles.quote)}>{quote}</span>
          </div>
        </PanelFrame>
      ) : (
        <div
          ref={content}
          onClick={(event) => {
            onActivate();
            const interactive = (event.target as HTMLElement).closest('button, textarea, input, a');
            if (!interactive && window.getSelection()?.isCollapsed !== false)
              setFocusReply((n) => n + 1);
          }}
        >
          <PanelFrame active={active}>
            <div {...stylex.props(styles.bar)}>
              <span {...stylex.props(styles.quote)}>{quote}</span>
              {actions ? <WaitingText thread={thread} agent={agent} /> : null}
              {!actions ? null : resolved ? (
                <button
                  type="button"
                  title={t('common.reopen')}
                  onClick={() => actions.reopen(thread.id)}
                  {...stylex.props(styles.icon)}
                >
                  <RotateCcw size={13} strokeWidth={2.2} />
                </button>
              ) : (
                <button
                  type="button"
                  title={t('common.markResolved')}
                  onClick={(event) => (event.stopPropagation(), void resolve(event.currentTarget))}
                  {...stylex.props(styles.icon)}
                  style={confirming ? CONFIRMED : undefined}
                >
                  <Check size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <ThreadMessages thread={thread} actions={actions} />
            {actions && reply.shown ? (
              <div ref={reply.outer} {...stylex.props(styles.replyBox)}>
                <div ref={reply.inner}>
                  <Composer
                    placeholder={t('common.reply')}
                    focusKey={focusReply}
                    onSubmit={(text) => actions.reply(thread.id, text)}
                  />
                </div>
              </div>
            ) : null}
          </PanelFrame>
        </div>
      )}
    </div>
  );
}
