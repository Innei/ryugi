import { RichRenderer } from '@haklex/rich-compose';
import { ALERT_NODE_KEY, CODE_BLOCK_NODE_KEY, IMAGE_NODE_KEY, MERMAID_NODE_KEY, type RendererConfig } from '@haklex/rich-editor';
import { ChartNode } from '@haklex/rich-ext-chart/static';
import { ExcalidrawNode } from '@haklex/rich-ext-excalidraw/static';
import { stepsNodes } from '@haklex/rich-ext-steps';
import { AlertRenderer } from '@haklex/rich-renderer-alert';
import { CodeBlockRenderer } from '@haklex/rich-renderer-codeblock';
import { ImageRenderer } from '@haklex/rich-renderer-image';
import type { SerializedEditorState } from 'lexical';
import { ChevronDown } from 'lucide-react';
import type { RefObject } from 'react';
import type { HistoryChange, HistoryModel } from './DocumentHistory';
import { ChangeNav, OnlyChanges, SOURCES, UpdateNotice } from './HistoryPanel';
import { historyWhen } from './historyTime';
import { MermaidPreview } from './MermaidPreview';
import { t } from '../i18n';

const renderNodes = [ChartNode, ExcalidrawNode, ...stepsNodes];
const renderers: RendererConfig = { [ALERT_NODE_KEY]: AlertRenderer, [CODE_BLOCK_NODE_KEY]: CodeBlockRenderer, [IMAGE_NODE_KEY]: ImageRenderer, [MERMAID_NODE_KEY]: MermaidPreview };
const KINDS = { insert: 'history.kindInsert', delete: 'history.kindDelete', modify: 'history.kindModify' } as const;

interface Props { model: HistoryModel; theme: 'light' | 'dark'; title: string; narrow: boolean; bodyRef: RefObject<HTMLDivElement | null>; onPick: () => void }

export function HistoryContent({ model, theme, title, narrow, bodyRef, onPick }: Props) {
  const { session, selected, blocks, count, changeIndex, loading, error, streaming, onlyChanges } = model;
  const render = (value: SerializedEditorState) => <RichRenderer value={value} variant="article" theme={theme} extraNodes={renderNodes} rendererConfig={renderers} />;
  let change = -1;
  const block = (item: HistoryChange, index: number) => {
    if (item.kind === 'equal') {
      if (!onlyChanges) return <section key={index} className="history-hunk history-equal">{render(item.value)}</section>;
      return <button type="button" key={index} className="history-fold" onClick={model.showAll}><span>{t('history.unchanged', { count: item.value.root.children.length })}</span></button>;
    }
    change++;
    const box = item.before ? null : item.kind === 'insert' ? 'history-after' : item.kind === 'delete' ? 'history-before' : 'history-merged';
    return <section key={index} data-history-change="" data-current={change === changeIndex ? '' : undefined} className={`history-hunk history-${item.kind}`}>
      <div className="history-caption">
        <span className="history-kind">{t(KINDS[item.kind])}</span>
        {item.author ? <span>{historyWhen(item.author.change.timestamp)}{item.group ? ` · ${t(SOURCES[item.group.source])}` : ''}</span> : null}
      </div>
      {item.before
        ? <><div className="history-before">{render(item.before)}</div><div className="history-after">{render(item.value)}</div></>
        : <div className={box!}>{render(item.value)}</div>}
    </section>;
  };

  return <div className="history-view">
    {narrow ? <div className="history-strip">
      <button type="button" className="history-pick" onClick={onPick}>
        <span>{t('history.compareFrom')}</span>
        <strong>{t('history.toLatest', { from: selected ? historyWhen(selected.change.timestamp) : t('history.pickPoint') })}<ChevronDown size={12} aria-hidden="true" /></strong>
      </button>
      <OnlyChanges model={model} />
      <ChangeNav model={model} />
    </div> : null}
    {narrow ? <UpdateNotice model={model} /> : null}
    {error
      ? narrow
        ? <div role="alert" className="history-message">{t('history.readFailed', { error })}<button type="button" disabled={streaming} onClick={model.refresh}>{t('common.retry')}</button></div>
        : <p className="history-message">{t('history.unreadable')}</p>
      : loading || !session
        ? <div role="status" className="history-message">{streaming ? t('history.waitingEdits') : t('history.computing')}</div>
        : <div ref={bodyRef} aria-label={t('history.diffBody')} className="history-content">
          {session.latest.value.root.children.some((node) => node.type === 'heading' && (node as { tag?: string }).tag === 'h1') ? null : <h1>{title}</h1>}
          {!count ? <p role="status" className="history-note">{t('history.noDiff')}</p> : null}
          {blocks.map(block)}
          <p className="history-end">{t('history.endOfDiff')}</p>
        </div>}
  </div>;
}
