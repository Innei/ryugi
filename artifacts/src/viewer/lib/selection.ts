import type { InspectorDetail, InspectorNode, InspectorTweak } from '../../shared/inspector';
import { SELECTION_FULL_NODES, SELECTION_LIMITS as LIMIT, SELECTION_MAX_BYTES, SELECTION_MAX_NODES, type SelectedNode, type SelectionMessage, type SelectionNode, type SelectionState, type SelectionTweak } from '../../shared/selection';

interface Input {
  boards: Record<string, { file: string }>;
  frames: Record<string, { nodes: InspectorNode[]; tweaks: InspectorTweak[] }>;
  targets: { boardId: string; id: number }[];
  details: Record<string, InspectorDetail>;
}

export function buildSelectionState({ boards, frames, targets, details }: Input): SelectionState {
  const entries = new Map<string, SelectionNode>();
  for (const [board, frame] of Object.entries(frames)) {
    const spec = boards[board];
    if (!spec) continue;
    for (const node of frame.nodes) entries.set(`${board}:${node.id}`, { id: `${board}#${node.id}`, board, file: spec.file, tag: node.tag, path: node.path, name: node.name });
  }
  const changesOf = (board: string, id: number) => (frames[board]?.tweaks ?? []).filter((tweak) => tweak.id === id).map(({ property, from, value }) => ({ property, from, value }));
  const chosen = targets.filter(({ boardId, id }) => entries.has(`${boardId}:${id}`));
  const selectedKeys = new Set(chosen.map(({ boardId, id }) => `${boardId}:${id}`));
  const selected: SelectedNode[] = chosen.slice(0, SELECTION_FULL_NODES).map(({ boardId, id }) => {
    const detail = details[`${boardId}:${id}`];
    return { ...entries.get(`${boardId}:${id}`)!, text: detail?.text ?? '', html: detail?.html ?? '', tweaks: changesOf(boardId, id) };
  });
  const tweaks: SelectionTweak[] = [];
  for (const [board, frame] of Object.entries(frames)) for (const tweak of frame.tweaks) {
    const entry = entries.get(`${board}:${tweak.id}`);
    if (entry && !selectedKeys.has(`${board}:${tweak.id}`)) tweaks.push({ ...entry, property: tweak.property, from: tweak.from, value: tweak.value });
  }
  return { selected, more: chosen.length - selected.length, tweaks, nodes: [...entries.values()] };
}

const fits = (node: SelectionNode) => node.id.length <= LIMIT.id && node.board.length <= LIMIT.board && node.file.length <= LIMIT.file && node.tag.length <= LIMIT.tag && node.path.length <= LIMIT.path && node.name.length <= LIMIT.name;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export function fitSelectionMessage(message: SelectionMessage, maxBytes = SELECTION_MAX_BYTES): SelectionMessage {
  const selected = message.selected.filter((node) => fits(node) && node.text.length <= LIMIT.text && node.html.length <= LIMIT.html);
  const tweaks = message.tweaks.filter((tweak) => fits(tweak) && tweak.from.length <= LIMIT.from && tweak.value.length <= LIMIT.value);
  let fitted = { ...message, selected, tweaks, nodes: message.nodes.filter(fits).slice(0, SELECTION_MAX_NODES) };
  for (let size = bytes(fitted); size > maxBytes && fitted.nodes.length; size = bytes(fitted)) {
    fitted = { ...fitted, nodes: fitted.nodes.slice(0, Math.floor(fitted.nodes.length * Math.min(0.95, maxBytes / size))) };
  }
  return fitted;
}
