import { Tree, type TreeDataNode } from '@lobehub/ui';
import { Columns3, Frame, Grid2X2, Image, MousePointer2, Rows3, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSpec } from '../../shared/types';
import type { InspectorNode } from '../../shared/inspector';
import type { Inspector } from '../hooks/useInspector';
import { t } from '../i18n';

const icons = { Frame, Column: Columns3, Row: Rows3, Grid: Grid2X2, Title: Type, Text: Type, Image, Button: MousePointer2 };
const keyOf = (boardId: string, session: string, id: number) => `${encodeURIComponent(boardId)}:${encodeURIComponent(session)}:${id}`;
interface Props {
  boards: [string, BoardSpec][];
  frames: Inspector['frames'];
  selection: Inspector['selection'];
  targets?: Inspector['targets'];
  playing: ReadonlySet<string>;
  select: Inspector['select'];
  hoverNode: Inspector['hoverNode'];
}

export function Layers({ boards, frames, selection, targets, playing, select, hoverNode }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const hovered = useRef<string | null>(null);
  const toggle = useRef(false);
  const { treeData, byKey } = useMemo(() => {
    const byKey = new Map<string, { boardId: string; node: InspectorNode; parentKey: string | null }>();
    const treeData: TreeDataNode[] = [];
    for (const [boardId, board] of boards) {
      const frame = frames[boardId];
      if (!frame?.nodes[0]) continue;
      const nodes = new Map(frame.nodes.map((node) => [node.id, node]));
      const paused = playing.has(boardId);
      const append = (node: InspectorNode, parentKey: string | null): TreeDataNode => {
        const key = keyOf(boardId, frame.session, node.id);
        byKey.set(key, { boardId, node, parentKey });
        const kind = parentKey === null ? 'Frame' : node.kind;
        const name = parentKey === null ? board.title || boardId : node.name;
        const Icon = icons[kind];
        return {
          key, disabled: paused, icon: <Icon size={14} aria-hidden />,
          title: <><span className="ri-layer-label" title={`${node.tag} · ${name || node.selector}`}><span className="ri-layer-kind">{t(`inspector.kind.${kind}`)}</span><span className="ri-layer-name">{name ? `“${name}”` : `<${node.tag}>`}</span></span>{parentKey !== null && <span className="ri-layer-id">#{node.id}</span>}{paused && <span className="ri-playing">{t('inspector.playing')}</span>}</>,
          children: node.children.flatMap((id) => { const child = nodes.get(id); return child ? [append(child, key)] : []; }),
        };
      };
      treeData.push(append(frame.nodes[0], null));
    }
    return { treeData, byKey };
  }, [boards, frames, playing]);
  const selectedKey = selection && frames[selection.boardId] ? keyOf(selection.boardId, frames[selection.boardId]!.session, selection.node.id) : null;
  const selectedKeys = targets ? targets.flatMap((target) => frames[target.boardId] ? [keyOf(target.boardId, frames[target.boardId]!.session, target.id)] : []) : selectedKey ? [selectedKey] : [];
  const ancestors: string[] = [];
  let parent = selectedKey ? byKey.get(selectedKey)?.parentKey : null;
  while (parent) { ancestors.push(parent); parent = byKey.get(parent)?.parentKey; }
  const ancestorKey = [selectedKey, ...ancestors].filter((key): key is string => !!key && !!byKey.get(key)?.node.children.length).join('|');
  useEffect(() => {
    if (ancestorKey) setExpanded((previous) => Array.from(new Set([...previous, ...ancestorKey.split('|')])));
  }, [ancestorKey]);
  const rowOf = (key: string) => Array.from(container.current?.querySelectorAll<HTMLElement>('[role=treeitem]') ?? []).find((el) => el.dataset.id === key);
  useEffect(() => { if (selectedKey) rowOf(selectedKey)?.scrollIntoView({ block: 'nearest' }); }, [selectedKey, expanded]);
  const count = Object.values(frames).reduce((sum, frame) => sum + frame.nodes.length, 0);
  return (
    <>
      <div className="ri-layer-heading"><span>{t('inspector.layers')}</span><span>{count ? t('inspector.elements', { count }) : t('common.loading')}</span></div>
      <div ref={container} className="ri-layers" role="region" aria-label={t('inspector.domLayers')}
        onClickCapture={(event) => { toggle.current = event.shiftKey || event.metaKey || event.ctrlKey; }}
        onKeyDownCapture={(event) => { toggle.current = event.shiftKey || event.metaKey || event.ctrlKey; }}
        onMouseOver={(event) => {
          const key = (event.target as Element).closest<HTMLElement>('[role=treeitem]')?.dataset.id;
          if (!key || hovered.current === key) return;
          const previous = hovered.current ? byKey.get(hovered.current) : null;
          const next = byKey.get(key);
          if (previous && previous.boardId !== next?.boardId) hoverNode(previous.boardId, null);
          hovered.current = key;
          if (next) hoverNode(next.boardId, next.node.id);
        }}
        onMouseLeave={() => { const previous = hovered.current ? byKey.get(hovered.current) : null; if (previous) hoverNode(previous.boardId, null); hovered.current = null; }}>
        <Tree treeData={treeData} size="small" multiple blockNode showIcon indent={14} expandedKeys={expanded} selectedKeys={selectedKeys}
          classNames={{ node: 'ri-layer' }} styles={{ node: { height: 27, fontSize: 12 }, title: { display: 'flex', alignItems: 'center', gap: 6 } }}
          onExpand={(keys, { expanded: opening, node }) => {
            if (!opening && (node.key === selectedKey || ancestors.includes(node.key))) rowOf(node.key)?.focus();
            setExpanded(keys);
          }}
          onSelect={(_, { node }) => { const entry = byKey.get(node.key); if (entry) { if (toggle.current) select(entry.boardId, entry.node.id, true); else select(entry.boardId, entry.node.id); } }} />
        {!treeData.length && <p className="ri-hint">{t('inspector.waitingBoard')}</p>}
      </div>
      {Object.values(frames).some((frame) => frame.truncated) && <p className="ri-limit" role="status">{t('inspector.truncated')}</p>}
    </>
  );
}
