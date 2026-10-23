import { ActionIcon, Button, ColorPicker, Input, InputNumber, Segmented, Select, Slider, Switch } from '@lobehub/ui';
import { Code2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef } from 'react';
import type { TweakControl, TweakValue } from '../../shared/tweaks';
import type { Rect } from '../../shared/types';
import type { BoardTweakState } from '../hooks/useBoardTweaks';
import type { View } from '../lib/view';
import './tweaks.css';

export const TWEAK_PANEL_WIDTH = 352;
export const tweakPanelAnchor = (board: Rect, view: View) => ({ left: view.x + (board.x + board.w) * view.k + 12, top: view.y + board.y * view.k });

function Control({ control, value, change }: { control: TweakControl; value: TweakValue; change: (value: TweakValue) => void }) {
  const id = useId();
  let input;
  if (control.type === 'color') input = <div className="rt-color">
    {control.options && <div className="rt-swatches" role="group" aria-label={control.label}>{control.options.map((option) => <button key={option.value} type="button" aria-label={`${control.label}: ${option.label}`} aria-pressed={value === option.value} style={{ backgroundColor: option.value }} onClick={() => change(option.value)} />)}</div>}
    <ColorPicker size="small" alpha={false} recent={false} value={value as string} onChange={change}><Button id={id} aria-label={control.label} size="small"><span className="rt-color-chip" style={{ backgroundColor: value as string }} /><code>{String(value)}</code></Button></ColorPicker>
  </div>;
  else if (control.type === 'boolean') input = <Switch id={id} aria-label={control.label} checked={value as boolean} onChange={change} />;
  else if (control.type === 'range') input = <div className="rt-range"><Slider aria-labelledby={`${id}-label`} value={value as number} min={control.min} max={control.max} step={control.step} onChange={change} /><output>{String(value)}</output></div>;
  else if (control.type === 'number') input = <InputNumber id={id} aria-label={control.label} size="small" value={value as number} min={control.min} max={control.max} step={control.step} onChange={(next) => { if (next !== null) change(next); }} style={{ width: '100%' }} />;
  else if (control.type === 'enum') input = control.options!.length <= 3
    ? <Segmented size="small" block aria-label={control.label} value={value as string} options={control.options} onChange={change} />
    : <Select id={id} aria-label={control.label} size="small" value={value as string} options={control.options} onChange={(next) => { if (typeof next === 'string') change(next); }} style={{ width: '100%' }} />;
  else input = <Input id={id} aria-label={control.label} size="small" maxLength={512} value={value as string} onChange={(event) => change(event.target.value)} />;
  return <div className="rt-field">{control.type === 'range' || control.type === 'enum' ? <span id={`${id}-label`}>{control.label}</span> : <label htmlFor={id}>{control.label}</label>}{input}</div>;
}

interface Props {
  boardId: string;
  title: string;
  state: BoardTweakState;
  anchor?: { left: number; top: number };
  onChange: (key: string, value: TweakValue) => void;
  onReset: () => void;
  onClose: () => void;
}

export function TweaksPanel({ boardId, title, state, anchor, onChange, onReset, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const groups = new Map<string, [string, TweakControl][]>();
  for (const entry of Object.entries(state.schema?.controls ?? {})) {
    const name = entry[1].section || 'Controls';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(entry);
  }
  const changed = Object.entries(state.values).filter(([key, value]) => value !== state.schema?.controls[key]?.default).length;
  return <>
    <aside className="ryugi-parameters" data-chrome="parameters" aria-label="Parameters" style={{ position: anchor ? 'absolute' : 'relative', ...anchor, width: TWEAK_PANEL_WIDTH }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && !event.defaultPrevented) onClose(); }}>
      <header className="rt-header"><SlidersHorizontal size={15} aria-hidden /><h2>Parameters</h2><ActionIcon icon={X} size="small" aria-label="Close parameters" title="Close parameters" onClick={onClose} /></header>
      <div className="rt-board"><Code2 size={17} aria-hidden /><div><strong>{title}</strong><code>{boardId}</code></div><span>Current board</span></div>
      <div className="rt-body">
        {state.error && <p className="rt-error" role="alert">{state.error}</p>}
        {[...groups].map(([name, controls]) => <section className="rt-section" key={name}><h3>{name}</h3>{controls.map(([key, control]) => <Control key={key} control={control} value={state.values[key]!} change={(value) => onChange(key, value)} />)}</section>)}
        {state.schema && <div className="rt-declaration"><span>Declared by this board's author</span><Button size="small" type="text" icon={Code2} onClick={() => dialog.current?.showModal()}>View declaration</Button></div>}
      </div>
      <footer className="rt-footer"><span role="status">{changed ? `${changed} changed · this board` : 'Defaults'}</span><Button size="small" type="text" icon={RotateCcw} disabled={!changed} onClick={onReset}>Reset</Button></footer>
    </aside>
    <dialog ref={dialog} className="rt-dialog" aria-label="Parameter declaration" onKeyDown={(event) => event.stopPropagation()}>
      <header><h2>Parameter declaration</h2><ActionIcon icon={X} size="small" aria-label="Close declaration" onClick={() => dialog.current?.close()} /></header>
      <pre tabIndex={0}>{JSON.stringify(state.schema, null, 2)}</pre><h3>Current values</h3><pre tabIndex={0}>{JSON.stringify(state.values, null, 2)}</pre><p>Preview values stay in this viewer session. Source files are unchanged.</p>
    </dialog>
  </>;
}
