import './inspector.css';

import type { InspectorRect } from '../../shared/inspector';
import type { BoardSpec } from '../../shared/types';
import type { View } from '../lib/view';

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
      className={`ri-outline${selected ? ' ri-outline-selected' : ''}`}
      style={{
        left: view.x + (board.x + rect.x) * view.k,
        top: view.y + (board.y + rect.y) * view.k,
        width: rect.width * view.k,
        height: rect.height * view.k,
      }}
    >
      {nodeId && <span className="ri-outline-id">{nodeId}</span>}
      {selected && (
        <>
          <span className="ri-outline-name">{name}</span>
          <i className="ri-corner ri-tl" />
          <i className="ri-corner ri-tr" />
          <i className="ri-corner ri-bl" />
          <i className="ri-corner ri-br" />
          <span className="ri-outline-size">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
        </>
      )}
    </div>
  );
}
