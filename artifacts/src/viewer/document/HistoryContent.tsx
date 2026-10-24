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

const renderNodes = [ChartNode, ExcalidrawNode, ...stepsNodes];
const renderers: RendererConfig = { [ALERT_NODE_KEY]: AlertRenderer, [CODE_BLOCK_NODE_KEY]: CodeBlockRenderer, [IMAGE_NODE_KEY]: ImageRenderer, [MERMAID_NODE_KEY]: MermaidPreview };
const KINDS = { insert: '新增', delete: '删除', modify: '修改' };

interface Props { model: HistoryModel; theme: 'light' | 'dark'; title: string; narrow: boolean; bodyRef: RefObject<HTMLDivElement | null>; onPick: () => void }

export function HistoryContent({ model, theme, title, narrow, bodyRef, onPick }: Props) {
  const { session, selected, blocks, count, changeIndex, loading, error, streaming, onlyChanges } = model;
  const render = (value: SerializedEditorState) => <RichRenderer value={value} variant="article" theme={theme} extraNodes={renderNodes} rendererConfig={renderers} />;
  let change = -1;
  const block = (item: HistoryChange, index: number) => {
    if (item.kind === 'equal') {
      if (!onlyChanges) return <section key={index} className="history-hunk history-equal">{render(item.value)}</section>;
      return <button type="button" key={index} className="history-fold" onClick={model.showAll}><span>{item.value.root.children.length} 段未改动 · 展开</span></button>;
    }
    change++;
    const box = item.before ? null : item.kind === 'insert' ? 'history-after' : item.kind === 'delete' ? 'history-before' : 'history-merged';
    return <section key={index} data-history-change="" data-current={change === changeIndex ? '' : undefined} className={`history-hunk history-${item.kind}`}>
      <div className="history-caption">
        <span className="history-kind">{KINDS[item.kind]}</span>
        {item.author ? <span>{historyWhen(item.author.change.timestamp)}{item.group ? ` · ${SOURCES[item.group.source]}` : ''}</span> : null}
      </div>
      {item.before
        ? <><div className="history-before">{render(item.before)}</div><div className="history-after">{render(item.value)}</div></>
        : <div className={box!}>{render(item.value)}</div>}
    </section>;
  };

  return <div className="history-view">
    {narrow ? <div className="history-strip">
      <button type="button" className="history-pick" onClick={onPick}>
        <span>对比起点 · 点按切换</span>
        <strong>{selected ? historyWhen(selected.change.timestamp) : '选择时间点'} → 最新<ChevronDown size={12} aria-hidden="true" /></strong>
      </button>
      <OnlyChanges model={model} />
      <ChangeNav model={model} />
    </div> : null}
    {narrow ? <UpdateNotice model={model} /> : null}
    {error
      ? narrow
        ? <div role="alert" className="history-message">无法读取历史：{error}<button type="button" disabled={streaming} onClick={model.refresh}>重试</button></div>
        : <p className="history-message">历史暂不可读，详情见右侧。</p>
      : loading || !session
        ? <div role="status" className="history-message">{streaming ? '等待本轮编辑完成…' : '正在计算差异…'}</div>
        : <div ref={bodyRef} aria-label="差异正文" className="history-content">
          {session.latest.value.root.children.some((node) => node.type === 'heading' && (node as { tag?: string }).tag === 'h1') ? null : <h1>{title}</h1>}
          {!count ? <p role="status" className="history-note">与所选时间点没有差异。选择更早的记录查看修改。</p> : null}
          {blocks.map(block)}
          <p className="history-end">已到本次对比末尾。媒体资源未做历史归档，同一地址的文件可能已更新。</p>
        </div>}
  </div>;
}
