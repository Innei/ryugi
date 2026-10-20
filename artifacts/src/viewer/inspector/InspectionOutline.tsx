import type { InspectorRect } from '../../shared/inspector';
import type { BoardSpec } from '../../shared/types';
import type { View } from '../lib/view';
import './inspector.css';

interface Props { board: BoardSpec; rect: InspectorRect; view: View; name?: string; selected?: boolean }
export function InspectionOutline({ board, rect, view, name, selected }: Props) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return (
    <div className={`ri-outline${selected ? ' ri-outline-selected' : ''}`} aria-hidden="true" style={{ left: view.x + (board.x + rect.x) * view.k, top: view.y + (board.y + rect.y) * view.k, width: rect.width * view.k, height: rect.height * view.k }}>
      {selected && <><span className="ri-outline-name">{name}</span><i className="ri-corner ri-tl" /><i className="ri-corner ri-tr" /><i className="ri-corner ri-bl" /><i className="ri-corner ri-br" /><span className="ri-outline-size">{Math.round(rect.width)} × {Math.round(rect.height)}</span></>}
    </div>
  );
}
