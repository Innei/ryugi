import { Tree, type TreeDataNode } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { Columns3, Frame, Grid2X2, Image, MousePointer2, Rows3, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { InspectorNode } from '../../shared/inspector';
import type { BoardSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import { t } from '../i18n';
import { styles } from './styles';

const icons = {
  Frame,
  Column: Columns3,
  Row: Rows3,
  Grid: Grid2X2,
  Title: Type,
  Text: Type,
  Image,
  Button: MousePointer2,
};
const keyOf = (boardId: string, session: string, id: number) =>
  `${encodeURIComponent(boardId)}:${encodeURIComponent(session)}:${id}`;
interface Props {
  boards: [string, BoardSpec][];
  frames: Inspector['frames'];
  hoverNode: Inspector['hoverNode'];
  playing: ReadonlySet<string>;
  select: Inspector['select'];
  selection: Inspector['selection'];
  targets?: Inspector['targets'];
}

export function Layers({ boards, frames, selection, targets, playing, select, hoverNode }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const hovered = useRef<string | null>(null);
  const toggle = useRef(false);
  const selectedKey =
    selection && frames[selection.boardId]
      ? keyOf(selection.boardId, frames[selection.boardId]!.session, selection.node.id)
      : null;
  const selectedKeys = targets
    ? targets.flatMap((target) =>
        frames[target.boardId]
          ? [keyOf(target.boardId, frames[target.boardId]!.session, target.id)]
          : [],
      )
    : selectedKey
      ? [selectedKey]
      : [];
  // Key segments are URI-encoded, so "|" cannot collide with a real key.
  const selectedSignature = selectedKeys.join('|');
  const { treeData, byKey } = useMemo(() => {
    const selected = new Set(selectedSignature ? selectedSignature.split('|') : []);
    const byKey = new Map<
      string,
      { boardId: string; node: InspectorNode; parentKey: string | null }
    >();
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
          key,
          disabled: paused,
          icon: <Icon aria-hidden size={14} />,
          title: (
            <>
              <span
                title={`${node.tag} · ${name || node.selector}`}
                {...stylex.props(styles.layerLabel)}
              >
                <span {...stylex.props(selected.has(key) && styles.layerKindSelected)}>
                  {t(`inspector.kind.${kind}`)}
                </span>
                <span {...stylex.props(styles.layerName)}>
                  {name ? `“${name}”` : `<${node.tag}>`}
                </span>
              </span>
              {parentKey !== null && (
                <span data-layer-id="" {...stylex.props(styles.layerId)}>
                  #{node.id}
                </span>
              )}
              {paused && <span {...stylex.props(styles.playing)}>{t('inspector.playing')}</span>}
            </>
          ),
          children: node.children.flatMap((id) => {
            const child = nodes.get(id);
            return child ? [append(child, key)] : [];
          }),
        };
      };
      treeData.push(append(frame.nodes[0], null));
    }
    return { treeData, byKey };
  }, [boards, frames, playing, selectedSignature]);
  const ancestors: string[] = [];
  let parent = selectedKey ? byKey.get(selectedKey)?.parentKey : null;
  while (parent) {
    ancestors.push(parent);
    parent = byKey.get(parent)?.parentKey;
  }
  const ancestorKey = [selectedKey, ...ancestors]
    .filter((key): key is string => !!key && !!byKey.get(key)?.node.children.length)
    .join('|');
  useEffect(() => {
    if (ancestorKey)
      setExpanded((previous) => Array.from(new Set([...previous, ...ancestorKey.split('|')])));
  }, [ancestorKey]);
  const rowOf = (key: string) =>
    Array.from(container.current?.querySelectorAll<HTMLElement>('[role=treeitem]') ?? []).find(
      (el) => el.dataset.id === key,
    );
  useEffect(() => {
    if (selectedKey) rowOf(selectedKey)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey, expanded]);
  const count = Object.values(frames).reduce((sum, frame) => sum + frame.nodes.length, 0);
  return (
    <>
      <div {...stylex.props(styles.layerHeading)}>
        <span>{t('inspector.layers')}</span>
        <span {...stylex.props(styles.layerHeadingCount)}>
          {count ? t('inspector.elements', { count }) : t('common.loading')}
        </span>
      </div>
      <div
        aria-label={t('inspector.domLayers')}
        ref={container}
        role="region"
        {...stylex.props(styles.layers)}
        onClickCapture={(event) => {
          toggle.current = event.shiftKey || event.metaKey || event.ctrlKey;
        }}
        onKeyDownCapture={(event) => {
          toggle.current = event.shiftKey || event.metaKey || event.ctrlKey;
        }}
        onMouseLeave={() => {
          const previous = hovered.current ? byKey.get(hovered.current) : null;
          if (previous) hoverNode(previous.boardId, null);
          hovered.current = null;
        }}
        onMouseOver={(event) => {
          const key = (event.target as Element).closest<HTMLElement>('[role=treeitem]')?.dataset.id;
          if (!key || hovered.current === key) return;
          const previous = hovered.current ? byKey.get(hovered.current) : null;
          const next = byKey.get(key);
          if (previous && previous.boardId !== next?.boardId) hoverNode(previous.boardId, null);
          hovered.current = key;
          if (next) hoverNode(next.boardId, next.node.id);
        }}
      >
        <Tree
          blockNode
          multiple
          showIcon
          classNames={{ node: stylex.props(styles.layer).className }}
          expandedKeys={expanded}
          indent={14}
          selectedKeys={selectedKeys}
          size="small"
          treeData={treeData}
          styles={{
            node: { height: 27, fontSize: 12 },
            title: { display: 'flex', alignItems: 'center', gap: 6 },
          }}
          onExpand={(keys, { expanded: opening, node }) => {
            if (!opening && (node.key === selectedKey || ancestors.includes(node.key)))
              rowOf(node.key)?.focus();
            setExpanded(keys);
          }}
          onSelect={(_, { node }) => {
            const entry = byKey.get(node.key);
            if (entry) {
              if (toggle.current) select(entry.boardId, entry.node.id, true);
              else select(entry.boardId, entry.node.id);
            }
          }}
        />
        {!treeData.length && (
          <p {...stylex.props(styles.hint, styles.hintInLayers)}>{t('inspector.waitingBoard')}</p>
        )}
      </div>
      {Object.values(frames).some((frame) => frame.truncated) && (
        <p role="status" {...stylex.props(styles.limit)}>
          {t('inspector.truncated')}
        </p>
      )}
    </>
  );
}
