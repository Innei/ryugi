import { ActionIcon, Button, IconProvider } from '@lobehub/ui';
import { Copy, RotateCcw, X } from 'lucide-react';
import { memo, useState, type KeyboardEvent } from 'react';
import type { BoardSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import { Layers } from './Layers';
import { Properties } from './Properties';
import './inspector.css';

interface Props extends Pick<Inspector, 'frames' | 'selection' | 'select' | 'hoverNode' | 'change' | 'reset'> {
  boards: [string, BoardSpec][];
  playing: ReadonlySet<string>;
  enabled: boolean;
  onClose: () => void;
}
const tabs = ['Properties', 'Code', 'Tweaks'] as const;

export const InspectorPanel = memo(function InspectorPanel({ boards, frames, selection, playing, select, hoverNode, change, reset, enabled, onClose }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Properties');
  const [copyStatus, setCopyStatus] = useState('');
  const node = selection?.node;
  const tweaks = Object.entries(frames).flatMap(([boardId, frame]) => frame.tweaks.map((tweak) => ({ ...tweak, boardId })));
  const css = node ? `${node.selector} {\n${Object.entries(node.css).map(([key, value]) => `  ${key}: ${value};`).join('\n')}\n}` : '';
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('Copied to clipboard'); }
    catch { setCopyStatus('Copy failed. Select the code and copy it manually.'); }
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[next]!);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  };
  return (
    <IconProvider config={{ 'aria-hidden': true }}><aside className="ryugi-inspector" data-chrome aria-label="Inspector">
      <header className="ri-header"><div className="ri-tabs" role="tablist" aria-label="Inspector views">
        {tabs.map((name, index) => <button key={name} type="button" role="tab" id={`ri-tab-${name}`} aria-controls={`ri-panel-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={(event) => onTabKey(event, index)}>{name}{name === 'Tweaks' && tweaks.length > 0 && <span className="ri-change-dot" />}</button>)}
      </div><ActionIcon icon={X} size="small" aria-label="Close inspector" title="Close inspector" onClick={onClose} /></header>
      <Layers boards={boards} frames={frames} selection={selection} playing={playing} select={select} hoverNode={hoverNode} />
      <div className="ri-node-meta"><code>{node ? `<${node.tag}>` : 'Select an element'}</code><span title={node?.selector}>{node?.selector}</span>{node && <span className="ri-live">Live</span>}</div>
      <div className="ri-panel-body" role="tabpanel" id={`ri-panel-${tab}`} aria-labelledby={`ri-tab-${tab}`}>
        {tab === 'Properties' && (node && enabled ? <Properties key={`${selection!.boardId}:${frames[selection!.boardId]?.session}:${node.id}`} node={node} change={change} /> : <p className="ri-empty">{!enabled ? 'Close the expanded preview to inspect elements.' : 'Click an element on the canvas or choose a layer to inspect its properties.'}</p>)}
        {tab === 'Code' && (node ? <div className="ri-code">
          <div className="ri-code-heading"><h2>Computed CSS</h2><Button size="small" type="text" icon={Copy} onClick={() => void copy(css)}>Copy</Button></div><pre tabIndex={0}>{css}</pre>
          <div className="ri-code-heading"><h2>HTML</h2><Button size="small" type="text" icon={Copy} onClick={() => void copy(node.html)}>Copy</Button></div><pre tabIndex={0}>{node.html}</pre>
          <p className="ri-hint" role="status">{copyStatus || 'From the live DOM. Source files stay unchanged.'}</p>
        </div> : <p className="ri-empty">Select an element to view its HTML and CSS.</p>)}
        {tab === 'Tweaks' && <section className="ri-section"><h2>Session changes <span className="ri-count">{tweaks.length}</span></h2><p className="ri-hint">Changes apply to this preview until the frame reloads.</p>
          <div className="ri-tweaks">{tweaks.map((tweak) => <div className="ri-tweak" key={`${tweak.boardId}:${tweak.id}:${tweak.property}`}><span>{boards.find(([id]) => id === tweak.boardId)?.[1].title || tweak.boardId} · {tweak.name}</span><code>{tweak.property}: {tweak.value}</code></div>)}</div>
          {!tweaks.length && <p className="ri-hint">No changes yet. Adjust a property to try it.</p>}
          <Button icon={RotateCcw} size="small" block disabled={!tweaks.length} onClick={reset}>Reset preview</Button>
        </section>}
      </div>
      <footer className="ri-footer"><span className="ri-status-dot" />{tweaks.length ? `${tweaks.length} preview changes` : 'Live inspection'}<span>Preview only</span></footer>
    </aside></IconProvider>
  );
});
