import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { MessageCirclePlus, X } from 'lucide-react';
import type { BoardThread } from '../../shared/board-comments';
import { authorOf } from '../document/author';
import { anchorLabel, staleText } from '../lib/board-anchor';
import '../inspector/inspector.css';
import { brand } from '../tokens.stylex';
import { i18n, useTranslation } from '../i18n';

export type CommentsTab = 'open' | 'all';

const styles = stylex.create({
  head: {
    height: 49,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    fontSize: 13,
    fontWeight: 600,
  },
  count: { fontFamily: cssVar.fontFamilyCode, fontSize: 11, fontWeight: 400, color: cssVar.colorTextTertiary },
  close: { marginInlineStart: 'auto', padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText }, cursor: 'pointer', display: 'grid' },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    height: 38,
    flexShrink: 0,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
  },
  tab: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', fontSize: 12, color: { default: cssVar.colorTextTertiary, ':hover': cssVar.colorText }, cursor: 'pointer' },
  tabOn: { color: cssVar.colorText },
  list: { flex: 1, minHeight: 0, overflowY: 'auto' },
  row: {
    display: 'flex',
    gap: 10,
    paddingBlock: 12,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    cursor: 'pointer',
    backgroundColor: { default: 'transparent', ':hover': cssVar.colorFillQuaternary },
  },
  rowOn: { borderLeftColor: '#4285ee' },
  num: {
    width: 22,
    height: 22,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50% 50% 50% 0',
    backgroundColor: '#4285ee',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
  },
  numAgent: { backgroundColor: brand.accentStrong },
  numReject: { backgroundColor: '#e5484d' },
  numResolved: { backgroundColor: '#3a3a3a', color: '#999' },
  numStale: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#e5a54b', color: '#e5a54b' },
  body: { flex: 1, minWidth: 0 },
  meta: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: cssVar.colorTextTertiary },
  who: { color: cssVar.colorText, fontWeight: 600 },
  time: { marginInlineStart: 'auto', color: cssVar.colorTextQuaternary },
  where: { marginBlock: 2, fontFamily: cssVar.fontFamilyCode, fontSize: 10.5, color: cssVar.colorTextTertiary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  stale: { color: '#e5a54b' },
  text: { fontSize: 12, lineHeight: 1.6, color: cssVar.colorText, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' },
  foot: { marginTop: 4, fontSize: 11, color: cssVar.colorTextTertiary },
  empty: { display: 'flex', alignItems: 'center', gap: 8, padding: 18, fontSize: 12, color: cssVar.colorTextSecondary },
});

interface Props {
  threads: BoardThread[];
  page: string | null;
  stale: Set<string>;
  numbers: Map<string, number>;
  openId: string | null;
  tab: CommentsTab;
  onTab: (tab: CommentsTab) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

export function CommentsPanel({ threads, page, stale, numbers, openId, tab, onTab, onOpen, onClose }: Props) {
  const { t } = useTranslation();
  const onPage = threads.filter((thread) => thread.anchor.page === page && thread.anchor.verdict !== 'pass' && thread.messages.some((m) => !m.deleted));
  const open = onPage.filter((thread) => thread.status === 'open');
  const shown = (tab === 'open' ? open : onPage).sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
  return (
    <aside className="ryugi-inspector" data-chrome aria-label={t('chrome.comments')}>
      <div {...stylex.props(styles.head)}>
        {t('chrome.comments')} <span {...stylex.props(styles.count)}>{open.length}</span>
        <button type="button" aria-label={t('chrome.closeComments')} title={t('chrome.closeCommentsTitle')} onClick={onClose} {...stylex.props(styles.close)}>
          <X size={14} />
        </button>
      </div>
      <div {...stylex.props(styles.tabs)}>
        <button type="button" onClick={() => onTab('open')} {...stylex.props(styles.tab, tab === 'open' && styles.tabOn)}>{t('chrome.openTab', { count: open.length })}</button>
        <button type="button" onClick={() => onTab('all')} {...stylex.props(styles.tab, tab === 'all' && styles.tabOn)}>{t('chrome.allTab', { count: onPage.length })}</button>
      </div>
      <div {...stylex.props(styles.list)}>
        {shown.length === 0 ? (
          <div {...stylex.props(styles.empty)}>
            <MessageCirclePlus size={14} aria-hidden />
            {t('comments.emptyCanvas')}
          </div>
        ) : null}
        {shown.map((thread) => {
          const [first] = thread.messages;
          const replies = thread.messages.length - 1;
          const isStale = stale.has(thread.id);
          return (
            <div key={thread.id} data-thread={thread.id} onClick={() => onOpen(thread.id)} {...stylex.props(styles.row, thread.id === openId && styles.rowOn)}>
              <span {...stylex.props(styles.num, first?.author === 'agent' && styles.numAgent, thread.anchor.verdict === 'reject' && styles.numReject, thread.status === 'resolved' && styles.numResolved, isStale && styles.numStale)}>{numbers.get(thread.id)}</span>
              <div {...stylex.props(styles.body)}>
                <div {...stylex.props(styles.meta)}>
                  <span {...stylex.props(styles.who)}>{first ? authorOf(first).label : ''}</span>
                  {thread.status === 'resolved' ? <span>{t('common.resolved')}</span> : null}
                  <span {...stylex.props(styles.time)}>{first ? timeOf(first.at) : ''}</span>
                </div>
                <div {...stylex.props(styles.where, isStale && styles.stale)}>
                  {anchorLabel(thread.anchor)}
                  {isStale ? ` · ${staleText(thread.anchor)}` : ''}
                </div>
                <div {...stylex.props(styles.text)}>{first?.deleted ? t('common.deleted') : first?.text}</div>
                {replies > 0 ? <div {...stylex.props(styles.foot)}>{t('comments.replies', { count: replies })}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
