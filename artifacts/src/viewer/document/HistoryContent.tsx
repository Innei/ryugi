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
import * as stylex from '@stylexjs/stylex';
import type { SerializedEditorState } from 'lexical';
import { ChevronDown } from 'lucide-react';
import type { RefObject } from 'react';

import { t } from '../i18n';
import type { HistoryChange, HistoryModel } from './DocumentHistory';
import { ChangeNav, OnlyChanges, SOURCES, UpdateNotice } from './HistoryPanel';
import { styles } from './historyStyles';
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
  const viewClass = [stylex.props(styles.text).className, 'history-view'].filter(Boolean).join(' ');
  const hunkClass = [stylex.props(styles.hunk).className, 'history-hunk'].filter(Boolean).join(' ');
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
          <section className={hunkClass} key={index}>
            {render(item.value)}
          </section>
        );
      return (
        <button
          key={index}
          type="button"
          {...stylex.props(styles.buttonBase, styles.fold)}
          onClick={model.showAll}
        >
          <span>{t('history.unchanged', { count: item.value.root.children.length })}</span>
        </button>
      );
    }
    change++;
    const box = item.before
      ? null
      : item.kind === 'insert'
        ? 'afterBox'
        : item.kind === 'delete'
          ? 'beforeBox'
          : 'mergedBox';
    return (
      <section
        className={[hunkClass, stylex.props(styles.hunkBox).className].filter(Boolean).join(' ')}
        data-current={change === changeIndex ? '' : undefined}
        data-history-change=""
        key={index}
      >
        <div {...stylex.props(styles.caption)}>
          <span data-kind={item.kind} {...stylex.props(styles.kind)}>
            {t(KINDS[item.kind])}
          </span>
          {item.author ? (
            <span>
              {historyWhen(item.author.change.timestamp)}
              {item.group ? ` · ${t(SOURCES[item.group.source])}` : ''}
            </span>
          ) : null}
        </div>
        {item.before ? (
          <>
            <div {...stylex.props(styles.diffBox, styles.beforeBox)}>{render(item.before)}</div>
            <div {...stylex.props(styles.diffBox, styles.afterBox, styles.afterGap)}>
              {render(item.value)}
            </div>
          </>
        ) : (
          <div {...stylex.props(styles.diffBox, styles[box!])}>{render(item.value)}</div>
        )}
      </section>
    );
  };

  return (
    <div className={viewClass}>
      {narrow ? (
        <div {...stylex.props(styles.strip)}>
          <button type="button" {...stylex.props(styles.buttonBase, styles.pick)} onClick={onPick}>
            <span {...stylex.props(styles.pickSpan)}>{t('history.compareFrom')}</span>
            <strong {...stylex.props(styles.pickStrong)}>
              {t('history.toLatest', {
                from: selected ? historyWhen(selected.change.timestamp) : t('history.pickPoint'),
              })}
              <ChevronDown aria-hidden="true" size={12} />
            </strong>
          </button>
          <OnlyChanges model={model} />
          <ChangeNav strip model={model} />
        </div>
      ) : null}
      {narrow ? <UpdateNotice compact model={model} /> : null}
      {error ? (
        narrow ? (
          <div role="alert" {...stylex.props(styles.message)}>
            {t('history.readFailed', { error })}
            <button
              disabled={streaming}
              type="button"
              {...stylex.props(styles.buttonBase, styles.messageButton)}
              onClick={model.refresh}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <p {...stylex.props(styles.message)}>{t('history.unreadable')}</p>
        )
      ) : loading || !session ? (
        <div role="status" {...stylex.props(styles.message)}>
          {streaming ? t('history.waitingEdits') : t('history.computing')}
        </div>
      ) : (
        <div aria-label={t('history.diffBody')} ref={bodyRef} {...stylex.props(styles.content)}>
          {session.latest.value.root.children.some(
            (node) => node.type === 'heading' && (node as { tag?: string }).tag === 'h1',
          ) ? null : (
            <h1 {...stylex.props(styles.contentTitle)}>{title}</h1>
          )}
          {!count ? (
            <p role="status" {...stylex.props(styles.note)}>
              {t('history.noDiff')}
            </p>
          ) : null}
          {blocks.map(block)}
          <p {...stylex.props(styles.end)}>{t('history.endOfDiff')}</p>
        </div>
      )}
    </div>
  );
}
