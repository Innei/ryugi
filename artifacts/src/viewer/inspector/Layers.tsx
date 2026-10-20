import { ChevronRight, Columns3, Frame, Grid2X2, Image, MousePointer2, Rows3, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { BoardSpec } from '../../shared/types';
import type { InspectorNode } from '../../shared/inspector';
import type { Inspector } from '../hooks/useInspector';

const icons = { Frame, Column: Columns3, Row: Rows3, Grid: Grid2X2, Title: Type, Text: Type, Image, Button: MousePointer2 };
interface Props {
  boards: [string, BoardSpec][];
  frames: Inspector['frames'];
  selection: Inspector['selection'];
  playing: ReadonlySet<string>;
  select: Inspector['select'];
  hoverNode: Inspector['hoverNode'];
}

export function Layers({ boards, frames, selection, playing, select, hoverNode }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const elements = useRef(new Map<string, HTMLDivElement>());
  const keyOf = (boardId: string, id: number) => `${boardId}:${frames[boardId]?.session}:${id}`;
  const maps = useMemo(() => new Map(Object.entries(frames).map(([boardId, frame]) => [boardId, new Map(frame.nodes.map((node) => [node.id, node]))])), [frames]);
  const ancestors: string[] = [];
  if (selection) {
    let node = maps.get(selection.boardId)?.get(selection.node.id);
    while (node) { ancestors.push(keyOf(selection.boardId, node.id)); node = node.parentId === null ? undefined : maps.get(selection.boardId)?.get(node.parentId); }
  }
  const ancestorKey = ancestors.join('|');
  useEffect(() => {
    if (!ancestorKey) return;
    setOpen((previous) => new Set([...previous, ...ancestorKey.split('|')]));
  }, [ancestorKey]);
  useEffect(() => {
    const selectedKey = ancestorKey.split('|')[0];
    if (selectedKey) elements.current.get(selectedKey)?.scrollIntoView({ block: 'nearest' });
  }, [ancestorKey, open]);

  const rows: { boardId: string; node: InspectorNode; depth: number; key: string; name: string }[] = [];
  for (const [boardId, board] of boards) {
    const nodes = maps.get(boardId);
    const root = frames[boardId]?.nodes[0];
    if (!root) continue;
    const append = (node: InspectorNode, depth: number) => {
      const key = keyOf(boardId, node.id);
      rows.push({ boardId, node, depth, key, name: depth === 0 ? board.title || boardId : node.name });
      if (open.has(key)) for (const id of node.children) { const child = nodes?.get(id); if (child) append(child, depth + 1); }
    };
    append(root, 0);
  }
  const focusKey = ancestors.find((key) => rows.some((row) => row.key === key)) ?? rows[0]?.key;
  const toggle = (key: string, expanded: boolean) => {
    if (!expanded && ancestors.includes(key)) elements.current.get(key)?.focus();
    setOpen((previous) => { const next = new Set(previous); if (expanded) next.add(key); else next.delete(key); return next; });
  };
  const focus = (index: number) => {
    const row = rows[index];
    if (row) { elements.current.get(row.key)?.focus(); if (!playing.has(row.boardId)) select(row.boardId, row.node.id); }
  };
  const onKey = (event: KeyboardEvent, index: number) => {
    const row = rows[index]!;
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focus(index + 1); break;
      case 'ArrowUp': event.preventDefault(); focus(index - 1); break;
      case 'Home': event.preventDefault(); focus(0); break;
      case 'End': event.preventDefault(); focus(rows.length - 1); break;
      case 'ArrowRight': event.preventDefault(); if (row.node.children.length) { if (open.has(row.key)) focus(index + 1); else toggle(row.key, true); } break;
      case 'ArrowLeft': {
        event.preventDefault();
        if (row.node.children.length && open.has(row.key)) toggle(row.key, false);
        else if (row.node.parentId !== null) focus(rows.findIndex((item) => item.boardId === row.boardId && item.node.id === row.node.parentId));
        break;
      }
      case 'Enter': case ' ': event.preventDefault(); if (!playing.has(row.boardId)) select(row.boardId, row.node.id); break;
    }
  };
  const count = Object.values(frames).reduce((sum, frame) => sum + frame.nodes.length, 0);
  return (
    <>
      <div className="ri-layer-heading"><span>LAYERS</span><span>{count ? `${count} elements` : 'Loading…'}</span></div>
      <div className="ri-layers" role="tree" aria-label="DOM layers" onMouseLeave={() => { if (selection) hoverNode(selection.boardId, null); }}>
        {rows.map(({ boardId, node, depth, key, name }, index) => {
          const Icon = icons[node.kind];
          const chosen = selection?.boardId === boardId && selection.node.id === node.id;
          const paused = playing.has(boardId);
          return (
            <div
              key={key}
              ref={(el) => { if (el) elements.current.set(key, el); else elements.current.delete(key); }}
              className="ri-layer" role="treeitem" aria-label={`${depth === 0 ? 'Frame' : node.kind} ${name || node.tag}`}
              aria-level={depth + 1} aria-selected={chosen} aria-expanded={node.children.length ? open.has(key) : undefined}
              aria-disabled={paused || undefined} tabIndex={key === focusKey ? 0 : -1}
              style={{ paddingLeft: 7 + depth * 14 }} title={paused ? 'Pause this board to inspect its elements' : `${node.tag} · ${name || node.selector}`}
              onClick={() => { if (!paused) select(boardId, node.id); }} onKeyDown={(event) => onKey(event, index)}
              onMouseEnter={() => hoverNode(boardId, node.id)}
            >
              <button type="button" className="ri-chevron" tabIndex={-1} aria-label={`${open.has(key) ? 'Collapse' : 'Expand'} ${name || node.tag}`} disabled={!node.children.length}
                onClick={(event) => { event.stopPropagation(); toggle(key, !open.has(key)); }}>
                {node.children.length > 0 && <ChevronRight size={13} style={{ transform: open.has(key) ? 'rotate(90deg)' : undefined }} />}
              </button>
              <Icon size={14} className="ri-node-icon" />
              <span className="ri-layer-label"><span className="ri-layer-kind">{depth === 0 ? 'Frame' : node.kind}</span><span className="ri-layer-name">{name ? `“${name}”` : `<${node.tag}>`}</span></span>
              {paused && <span className="ri-playing">Playing</span>}
            </div>
          );
        })}
        {!rows.length && <p className="ri-hint">Waiting for a ready board…</p>}
      </div>
      {Object.values(frames).some((frame) => frame.truncated) && <p className="ri-limit" role="status">Showing up to 2,500 elements per board and 50 levels.</p>}
    </>
  );
}
