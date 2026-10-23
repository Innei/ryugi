import './history.css';
import { RichRenderer } from '@haklex/rich-compose';
import { ALERT_NODE_KEY, CODE_BLOCK_NODE_KEY, IMAGE_NODE_KEY, MERMAID_NODE_KEY, type RendererConfig } from '@haklex/rich-editor';
import { ChartNode } from '@haklex/rich-ext-chart/static';
import { ExcalidrawNode } from '@haklex/rich-ext-excalidraw/static';
import { stepsNodes } from '@haklex/rich-ext-steps';
import { AlertRenderer } from '@haklex/rich-renderer-alert';
import { CodeBlockRenderer } from '@haklex/rich-renderer-codeblock';
import { ImageRenderer } from '@haklex/rich-renderer-image';
import type { CreateEditorArgs, SerializedEditorState } from 'lexical';
import type { LoroDoc } from 'loro-crdt';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { useMedia } from '../hooks/useMedia';
import { readHistory, readHistoryState, type History, type HistoryEntry } from './history';
import { historyDiff, type HistoryDiffBlock } from './historyDiff';
import { MermaidPreview } from './MermaidPreview';

export interface DocumentHistoryProps { doc: LoroDoc; nodes: CreateEditorArgs['nodes']; streaming: boolean; theme: 'light' | 'dark'; title: string; onClose: () => void }
const renderNodes = [ChartNode, ExcalidrawNode, ...stepsNodes];
const renderers: RendererConfig = { [ALERT_NODE_KEY]: AlertRenderer, [CODE_BLOCK_NODE_KEY]: CodeBlockRenderer, [IMAGE_NODE_KEY]: ImageRenderer, [MERMAID_NODE_KEY]: MermaidPreview };
const sources = { human: '浏览器编辑', agent: 'Agent 编辑', session: '会话开始', unknown: '未标记编辑' };
const versionKey = (doc: LoroDoc) => JSON.stringify(doc.frontiers());
const time = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return seconds > 0 && Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '时间未记录';
};
interface Session { doc: LoroDoc; history: History; value: SerializedEditorState; key: string }

export function DocumentHistory({ doc, nodes, streaming, theme, title, onClose }: DocumentHistoryProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const selectedRef = useRef<HistoryEntry | null>(null);
  const snapshot = useRef<LoroDoc | null>(null);
  const generation = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [blocks, setBlocks] = useState<HistoryDiffBlock[]>([]);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [changeIndex, setChangeIndex] = useState(0);
  const [visible, setVisible] = useState(50);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState(false);
  const sheetRoot = useRef<HTMLDivElement>(null);
  const narrow = useMedia('(max-width: 1100px)');
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheet || !narrow) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sheetRoot.current;
    const controls = () => [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])];
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    panel?.addEventListener('keydown', trap);
    return () => { panel?.removeEventListener('keydown', trap); previous?.focus(); };
  }, [sheet, narrow]);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setError(null);
    const frozen = doc.fork();
    try {
      const history = await readHistory(frozen);
      const value = readHistoryState(frozen, frozen.frontiers(), nodes);
      if (generation.current !== token) { frozen.free(); return; }
      const previous = snapshot.current;
      snapshot.current = frozen;
      const next = selectedRef.current ?? history.groups[1]?.entries.at(-1) ?? history.entries[0] ?? null;
      selectedRef.current = next;
      setSelected(next);
      const key = versionKey(frozen);
      setSession({ doc: frozen, history, value, key });
      setPending(versionKey(doc) !== key);
      previous?.free();
    } catch (err) {
      frozen.free();
      if (generation.current === token) setError((err as Error).message);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }, [doc, nodes]);

  useEffect(() => {
    if (!streaming && !snapshot.current) void load();
  }, [load, streaming]);
  useEffect(() => () => { generation.current++; snapshot.current?.free(); snapshot.current = null; }, [doc]);
  useEffect(() => doc.subscribe(() => setPending(snapshot.current !== null && versionKey(doc) !== versionKey(snapshot.current))), [doc]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (sheet) setSheet(false); else onClose(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, sheet]);
  useEffect(() => {
    if (!session || !selected) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      try {
        const before = readHistoryState(session.doc, selected.frontiers, nodes);
        const next = historyDiff(before, session.value);
        if (!cancelled) { setBlocks(next); setChangeIndex(0); setError(null); }
      } catch (err) { if (!cancelled) setError((err as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session, selected, nodes]);

  const select = (entry: HistoryEntry) => { selectedRef.current = entry; setSelected(entry); setSheet(false); };
  const count = blocks.filter((block) => block.kind !== 'equal').length;
  const navigate = (direction: number) => {
    const next = Math.max(0, Math.min(count - 1, changeIndex + direction));
    setChangeIndex(next);
    body.current?.querySelectorAll<HTMLElement>('[data-history-change]')[next]?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  };
  const list = session ? <>
    <p className="history-help">选择时间点，与固定的最新版本比较</p>
    {session.history.groups.slice(0, visible).map((group) => {
      const end = group.entries.at(-1)!;
      const active = selected && group.entries.some(({ change }) => change.peer === selected.change.peer && change.counter <= selected.change.counter && change.counter + change.length >= selected.change.counter + selected.change.length);
      return <section key={group.id} className={`history-revision ${active ? 'active' : ''}`}>
        <button type="button" className="history-select" aria-current={active ? 'true' : undefined} onClick={() => select(end)}>
          <strong>{time(end.change.timestamp)}</strong>{active ? <span className="history-tag">对比起点</span> : null}
          <span>{sources[group.source]}</span><small>{group.entries.length} 次提交</small>
        </button>
        <button type="button" className="history-expand" aria-expanded={expanded.has(group.id)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}>{expanded.has(group.id) ? '⌄ 收起' : '› 展开'}原始提交</button>
        {expanded.has(group.id) ? <div className="history-raw">{[...group.entries].reverse().map((entry) => <button type="button" key={entry.id} title={entry.change.message} onClick={() => select(entry)}><span>{time(entry.change.timestamp)}</span><code>{entry.change.message || '未标记编辑'}</code></button>)}</div> : null}
      </section>;
    })}
    {visible < session.history.groups.length ? <button type="button" className="history-more" onClick={() => setVisible((value) => value + 50)}>加载更早记录</button> : <p className="history-end">{session.history.shallow ? '更早历史未保留' : '已到最早记录'}<br />{session.history.groups.length} 段编辑 · {session.history.entries.length} 次提交</p>}
    <p className="history-help">时间来自编辑设备，顺序按因果关系排列。</p>
  </> : <p role="status" className="history-help">{streaming ? '等待本轮编辑完成…' : '正在加载历史…'}</p>;
  const renderValue = (value: SerializedEditorState) => <RichRenderer value={value} variant="article" theme={theme} extraNodes={renderNodes} rendererConfig={renderers} />;

  return <main className="document-history">
    <section className="history-work">
      <header className="history-toolbar"><div className="history-toolbar-row"><strong>历史对比</strong><span className="history-tag">只读</span><button type="button" className="history-exit" onClick={onClose}>退出对比 ↗</button></div>
        <div className="history-basis">{selected ? time(selected.change.timestamp) : '选择时间点'} <span aria-hidden="true">───&gt;</span> 最新版本 {session ? time(session.history.entries.at(-1)?.change.timestamp ?? 0) : ''}</div>
        <div className="history-toolbar-row"><span className="history-delete-label">− 旧内容</span><span className="history-insert-label">+ 新内容</span><button type="button" className="history-filter" aria-pressed={onlyChanges} onClick={() => setOnlyChanges((value) => !value)}>仅看变更</button><span role="status" aria-live="polite">{count ? changeIndex + 1 : 0} / {count} 处</span><button type="button" aria-label="上一处变更" disabled={changeIndex === 0 || loading} onClick={() => navigate(-1)}>↑</button><button type="button" aria-label="下一处变更" disabled={changeIndex >= count - 1 || loading} onClick={() => navigate(1)}>↓</button></div>
        {narrow ? <button type="button" className="history-more" onClick={() => setSheet(true)}>选择历史版本</button> : null}
      </header>
      {pending ? <div className="history-update" role="status">{streaming ? '等待本轮编辑完成…' : '最新文档有新内容'}<button type="button" disabled={streaming || loading} onClick={() => void load()}>更新对比 →</button></div> : null}
      {error ? <div role="alert" className="history-message">无法读取历史：{error}<button type="button" disabled={streaming} onClick={() => void load()}>重试</button></div> : loading || (streaming && !session) ? <div role="status" className="history-message">{streaming ? '等待本轮编辑完成…' : '正在计算差异…'}</div> : <div ref={body} aria-label="差异正文" className="history-content">
        {session?.value.root.children.some((node) => node.type === 'heading' && (node as { tag?: string }).tag === 'h1') ? null : <h1>{title}</h1>}
        {!count ? <p className="history-message">与当前对比版本没有差异。选择更早的时间点查看修改。</p> : null}
        {blocks.map((block, index) => <section key={index} hidden={onlyChanges && block.kind === 'equal'} data-history-change={block.kind !== 'equal' ? '' : undefined} className={`history-hunk history-${block.kind}`}>
          {block.kind !== 'equal' ? <div className="history-hunk-label">{block.kind === 'insert' ? '+ 新增内容' : block.kind === 'delete' ? '− 删除内容' : '修改内容'}</div> : null}
          {block.before ? <><div className="history-before"><div className="history-hunk-label">− 旧内容</div>{renderValue(block.before)}</div><div className="history-after"><div className="history-hunk-label">+ 新内容</div>{renderValue(block.value)}</div></> : renderValue(block.value)}
        </section>)}
        <p className="history-end">已到本次对比末尾。媒体资源未做历史归档，同一地址的文件可能已更新。</p>
      </div>}
    </section>
    {!narrow ? <aside className="history-sidebar" aria-label="历史时间线"><h2>历史记录</h2>{list}</aside> : null}
    {narrow && sheet ? <div ref={sheetRoot} className="history-sheet" role="dialog" aria-modal="true" aria-label="选择历史版本"><BottomSheet snaps={[0, 0.85]} snap={0.85} onSnap={(next) => { if (next === 0) setSheet(false); }} onScrim={() => setSheet(false)} header={<div className="history-sheet-head"><strong>历史记录</strong><button type="button" onClick={() => setSheet(false)}>关闭</button></div>}>{list}</BottomSheet></div> : null}
  </main>;
}
