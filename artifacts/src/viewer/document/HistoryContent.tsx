import { RichRenderer } from '@haklex/rich-compose';
import {
  ALERT_NODE_KEY,
  CODE_BLOCK_NODE_KEY,
  IMAGE_NODE_KEY,
  MERMAID_NODE_KEY,
  type RendererConfig,
} from '@haklex/rich-editor';
import { ChartNode } from '@haklex/rich-ext-chart/static';
import { ExcalidrawNode } from '@haklex/rich-ext-excalidraw/static';
import { stepsNodes } from '@haklex/rich-ext-steps';
import { AlertRenderer } from '@haklex/rich-renderer-alert';
import { CodeBlockRenderer } from '@haklex/rich-renderer-codeblock';
import { ImageRenderer } from '@haklex/rich-renderer-image';
import type { SerializedEditorState } from 'lexical';
import { ChevronDown } from 'lucide-react';
import type { RefObject } from 'react';

import { t } from '../i18n';
import type { HistoryChange, HistoryModel } from './DocumentHistory';
import { ChangeNav, OnlyChanges, SOURCES, UpdateNotice } from './HistoryPanel';
import { historyWhen } from './historyTime';
import { MermaidPreview } from './MermaidPreview';

const renderNodes = [ChartNode, ExcalidrawNode, ...stepsNodes];
const renderers: RendererConfig = {
  [ALERT_NODE_KEY]: AlertRenderer,
  [CODE_BLOCK_NODE_KEY]: CodeBlockRenderer,
  [IMAGE_NODE_KEY]: ImageRenderer,
  [MERMAID_NODE_KEY]: MermaidPreview,
};
const KINDS = {
  insert: 'history.kindInsert',
  delete: 'history.kindDelete',
  modify: 'history.kindModify',
} as const;

interface Props {
  bodyRef: RefObject<HTMLDivElement | null>;
  model: HistoryModel;
  narrow: boolean;
  onPick: () => void;
  theme: 'light' | 'dark';
  title: string;
}

export function HistoryContent({ model, theme, title, narrow, bodyRef, onPick }: Props) {
  const { session, selected, blocks, count, changeIndex, loading, error, streaming, onlyChanges } =
    model;
  const render = (value: SerializedEditorState) => (
    <RichRenderer
      extraNodes={renderNodes}
      rendererConfig={renderers}
      theme={theme}
      value={value}
      variant="article"
    />
  );
  let change = -1;
  const block = (item: HistoryChange, index: number) => {
    if (item.kind === 'equal') {
      if (!onlyChanges)
        return (
          <section className="history-hunk history-equal" key={index}>
            {render(item.value)}
          </section>
        );
      return (
        <button className="history-fold" key={index} type="button" onClick={model.showAll}>
          <span>{t('history.unchanged', { count: item.value.root.children.length })}</span>
        </button>
      );
    }
    change++;
    const box = item.before
      ? null
      : item.kind === 'insert'
        ? 'history-after'
        : item.kind === 'delete'
          ? 'history-before'
          : 'history-merged';
    return (
      <section
        className={`history-hunk history-${item.kind}`}
        data-current={change === changeIndex ? '' : undefined}
        data-history-change=""
        key={index}
      >
        <div className="history-caption">
          <span className="history-kind">{t(KINDS[item.kind])}</span>
          {item.author ? (
            <span>
              {historyWhen(item.author.change.timestamp)}
              {item.group ? ` · ${t(SOURCES[item.group.source])}` : ''}
            </span>
          ) : null}
        </div>
        {item.before ? (
          <>
            <div className="history-before">{render(item.before)}</div>
            <div className="history-after">{render(item.value)}</div>
          </>
        ) : (
          <div className={box!}>{render(item.value)}</div>
        )}
      </section>
    );
  };

  return (
    <div className="history-view">
      {narrow ? (
        <div className="history-strip">
          <button className="history-pick" type="button" onClick={onPick}>
            <span>{t('history.compareFrom')}</span>
            <strong>
              {t('history.toLatest', {
                from: selected ? historyWhen(selected.change.timestamp) : t('history.pickPoint'),
              })}
              <ChevronDown aria-hidden="true" size={12} />
            </strong>
          </button>
          <OnlyChanges model={model} />
          <ChangeNav model={model} />
        </div>
      ) : null}
      {narrow ? <UpdateNotice model={model} /> : null}
      {error ? (
        narrow ? (
          <div className="history-message" role="alert">
            {t('history.readFailed', { error })}
            <button disabled={streaming} type="button" onClick={model.refresh}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <p className="history-message">{t('history.unreadable')}</p>
        )
      ) : loading || !session ? (
        <div className="history-message" role="status">
          {streaming ? t('history.waitingEdits') : t('history.computing')}
        </div>
      ) : (
        <div aria-label={t('history.diffBody')} className="history-content" ref={bodyRef}>
          {session.latest.value.root.children.some(
            (node) => node.type === 'heading' && (node as { tag?: string }).tag === 'h1',
          ) ? null : (
            <h1>{title}</h1>
          )}
          {!count ? (
            <p className="history-note" role="status">
              {t('history.noDiff')}
            </p>
          ) : null}
          {blocks.map(block)}
          <p className="history-end">{t('history.endOfDiff')}</p>
        </div>
      )}
    </div>
  );
}
