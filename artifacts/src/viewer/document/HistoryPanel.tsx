import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import type { HistoryModel } from './DocumentHistory';
import type { HistoryGroup } from './history';
import { historyClock, historyDay, historyWhen } from './historyTime';

export const SOURCES = { human: '浏览器编辑', agent: 'Agent 编辑', session: '会话开始', unknown: '未标记编辑' };

export function selectedGroup(model: HistoryModel) {
  const { session, selected } = model;
  return session && selected ? session.history.groups.find((group) => group.entries.includes(selected)) : undefined;
}

export function latestTime(model: HistoryModel) {
  return model.session?.history.entries.at(-1)?.change.timestamp ?? 0;
}

export function ChangeNav({ model }: { model: HistoryModel }) {
  const { count, changeIndex, loading } = model;
  return <>
    <span role="status" aria-live="polite" className="history-count">{count ? changeIndex + 1 : 0} / {count}</span>
    <button type="button" className="history-icon" aria-label="上一处变更" disabled={changeIndex === 0 || loading} onClick={() => model.navigate(-1)}><ChevronUp size={14} aria-hidden="true" /></button>
    <button type="button" className="history-icon" aria-label="下一处变更" disabled={changeIndex >= count - 1 || loading} onClick={() => model.navigate(1)}><ChevronDown size={14} aria-hidden="true" /></button>
  </>;
}

export function OnlyChanges({ model }: { model: HistoryModel }) {
  return <button type="button" className="history-filter" aria-pressed={model.onlyChanges} onClick={model.toggleOnly}>仅看变更</button>;
}

export function UpdateNotice({ model }: { model: HistoryModel }) {
  if (!model.pending) return null;
  return <div className="history-update" role="status">
    <span>{model.streaming ? '等待本轮编辑完成…' : `文档有新内容，对比仍停在 ${historyClock(latestTime(model))}`}</span>
    <button type="button" disabled={model.streaming || model.loading} onClick={model.refresh}><RotateCw size={12} aria-hidden="true" />更新对比</button>
  </div>;
}

function Compare({ model }: { model: HistoryModel }) {
  const { selected, blocks, count } = model;
  const group = selectedGroup(model);
  const plus = blocks.filter((block) => block.kind === 'insert' || block.kind === 'modify').length;
  const minus = blocks.filter((block) => block.kind === 'delete' || block.kind === 'modify').length;
  return <section className="history-compare" aria-label="对比范围">
    <dl>
      <dt>从</dt><dd><strong>{selected ? historyWhen(selected.change.timestamp) : '选择时间点'}</strong>{group ? <span>{SOURCES[group.source]}</span> : null}</dd>
      <dt>到</dt><dd><strong>最新版本</strong><span>{historyWhen(latestTime(model))}</span></dd>
    </dl>
    <div className="history-controls">
      <span>{count} 处变更</span><span className="history-plus">+{plus}</span><span className="history-minus">−{minus}</span>
      <span className="history-spacer" />
      <OnlyChanges model={model} />
      <ChangeNav model={model} />
    </div>
  </section>;
}

function Timeline({ model }: { model: HistoryModel }) {
  const [visible, setVisible] = useState(50);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { session, selected, blocks } = model;
  if (!session) return null;
  const { groups, entries, shallow } = session.history;
  const current = groups.findIndex((group) => selected !== null && group.entries.includes(selected));
  const changes = new Map<HistoryGroup, number>();
  for (const block of blocks) if (block.group) changes.set(block.group, (changes.get(block.group) ?? 0) + 1);
  const shown = groups.slice(0, visible);
  const dayOf = (group: HistoryGroup) => historyDay(group.entries.at(-1)!.change.timestamp);
  const toggle = (id: string) => setExpanded((open) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return <>
    <ol className="history-timeline" aria-label="历史时间线">
      {shown.map((group, index) => {
        const end = group.entries.at(-1)!;
        const day = dayOf(group);
        const newDay = index === 0 || day !== dayOf(shown[index - 1]!);
        const state = index === current ? 'selected' : index === 0 ? 'latest' : index < current ? 'range' : 'outside';
        const open = expanded.has(group.id);
        const changed = index < current ? changes.get(group) : undefined;
        return <li key={group.id} className="history-node" data-state={state} data-upper={index <= current ? 'in' : 'out'} data-lower={index < current ? 'in' : 'out'} data-day={newDay ? '' : undefined}>
          {newDay ? <div className="history-day">{day}</div> : null}
          <div className="history-row">
            <span className="history-dot" aria-hidden="true" />
            <button type="button" className="history-select" aria-current={state === 'selected' ? 'true' : undefined} onClick={() => model.select(end)}>
              <span className="history-line">
                <strong>{historyClock(end.change.timestamp)}</strong><span>{SOURCES[group.source]}</span>
                {state === 'latest' ? <span className="history-tag">最新</span> : null}
                {state === 'selected' ? <span className="history-tag history-start">对比起点</span> : null}
              </span>
              <span className="history-meta">{group.entries.length} 次提交{changed ? <span className="history-changed"> · {changed} 处变更</span> : null}</span>
            </button>
            <button type="button" className="history-icon history-expand" aria-label={open ? '收起原始提交' : '展开原始提交'} aria-expanded={open} onClick={() => toggle(group.id)}><ChevronRight size={14} aria-hidden="true" /></button>
          </div>
          {open ? <div className="history-raw">{[...group.entries].reverse().map((entry) => (
            <button type="button" key={entry.id} title={entry.change.message} aria-current={entry === selected ? 'true' : undefined} onClick={() => model.select(entry)}>
              <span>{historyClock(entry.change.timestamp, true)}</span><code>{entry.change.message || '未标记编辑'}</code>
            </button>
          ))}</div> : null}
        </li>;
      })}
    </ol>
    {visible < groups.length
      ? <button type="button" className="history-more" onClick={() => setVisible((value) => value + 50)}>加载更早记录</button>
      : <p className="history-end">{shallow ? '更早历史未保留' : '已到最早记录'} · {groups.length} 段编辑 · {entries.length} 次提交<br />时间来自编辑设备，按因果顺序排列</p>}
  </>;
}

function Waiting({ streaming }: { streaming: boolean }) {
  return <div className="history-waiting">
    <p role="status">{streaming ? <><strong>Agent 正在编辑</strong><span>本轮编辑完成后再读取历史，避免对比到半截内容</span></> : <strong>正在加载历史…</strong>}</p>
    <div className="history-skeleton" aria-hidden="true">{[150, 130, 160, 120].map((width) => <span key={width} style={{ width }} />)}</div>
  </div>;
}

function Failure({ model }: { model: HistoryModel }) {
  return <div role="alert" className="history-failure">
    <strong><CircleAlert size={15} aria-hidden="true" />无法读取历史</strong>
    <code>{model.error}</code>
    <span>文档本身没有受影响，可以继续阅读与评论。</span>
    <span className="history-actions">
      <button type="button" className="history-button" disabled={model.streaming} onClick={model.refresh}>重试</button>
      <button type="button" className="history-quiet" onClick={model.close}>回到评论</button>
    </span>
  </div>;
}

export function HistoryPanel({ model }: { model: HistoryModel }) {
  return <aside className="history-panel" aria-label="历史记录">
    <header className="history-panel-head">
      <h2>历史记录</h2>
      <button type="button" className="history-icon" aria-label="关闭历史，回到评论" onClick={model.close}><X size={14} aria-hidden="true" /></button>
    </header>
    <UpdateNotice model={model} />
    {model.error ? <Failure model={model} /> : !model.session ? <Waiting streaming={model.streaming} /> : <><Compare model={model} /><Timeline model={model} /></>}
  </aside>;
}

export function HistorySheet({ model, onDismiss }: { model: HistoryModel; onDismiss: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = root.current;
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
  }, []);
  const header = <div className="history-sheet-head">
    <span><strong>选择对比起点</strong><small>与最新版本 · {historyWhen(latestTime(model))} 比较</small></span>
    <button type="button" onClick={onDismiss}>完成</button>
  </div>;
  return <div ref={root} className="history-sheet" role="dialog" aria-modal="true" aria-label="选择对比起点">
    <BottomSheet snaps={[0, 0.85]} snap={0.85} onSnap={(next) => { if (next === 0) onDismiss(); }} onScrim={onDismiss} header={header}>
      <div className="history-sheet-body"><Timeline model={model} /></div>
    </BottomSheet>
  </div>;
}
