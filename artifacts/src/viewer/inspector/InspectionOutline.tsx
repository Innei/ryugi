import * as stylex from '@stylexjs/stylex';

import type { InspectorRect } from '../../shared/inspector';
import type { BoardSpec } from '../../shared/types';
import type { View } from '../lib/view';
import { styles } from './styles';

interface Props {
  board: BoardSpec;
  name?: string;
  nodeId?: string;
  rect: InspectorRect;
  selected?: boolean;
  view: View;
}
export function InspectionOutline({ board, rect, view, name, nodeId, selected }: Props) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return (
    <div
      aria-hidden="true"
      data-outline=""
      data-selected={selected ? '' : undefined}
      {...stylex.props(styles.outline, selected && styles.outlineSelected)}
      style={{
        left: view.x + (board.x + rect.x) * view.k,
        top: view.y + (board.y + rect.y) * view.k,
        width: rect.width * view.k,
        height: rect.height * view.k,
      }}
    >
      {nodeId && (
        <span data-outline-id="" {...stylex.props(styles.outlineId)}>
          {nodeId}
        </span>
      )}
      {selected && (
        <>
          <span data-outline-name="" {...stylex.props(styles.outlineName)}>
            {name}
          </span>
          <i {...stylex.props(styles.corner, styles.cornerTl)} />
          <i {...stylex.props(styles.corner, styles.cornerTr)} />
          <i {...stylex.props(styles.corner, styles.cornerBl)} />
          <i {...stylex.props(styles.corner, styles.cornerBr)} />
          <span {...stylex.props(styles.outlineSize)}>
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
        </>
      )}
    </div>
  );
}
