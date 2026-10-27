import {
  INSPECTOR_PROPERTIES,
  type InspectorNode,
  type InspectorProperty,
  type InspectorReport,
} from '../../shared/inspector';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e8;
const id = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
const rect = (value: unknown) =>
  value === null ||
  (object(value) &&
    number(value.x) &&
    number(value.y) &&
    number(value.width) &&
    number(value.height) &&
    value.width >= 0 &&
    value.height >= 0);
const property = (value: unknown): value is InspectorProperty =>
  (INSPECTOR_PROPERTIES as readonly unknown[]).includes(value);
const kinds = new Set(['Frame', 'Column', 'Row', 'Grid', 'Title', 'Text', 'Image', 'Button']);

function validTree(value: unknown) {
  if (!Array.isArray(value) || value.length > 2500) return false;
  const seen = new Map<number, InspectorNode>();
  for (const node of value) {
    if (
      !object(node) ||
      !id(node.id) ||
      seen.has(node.id) ||
      !text(node.name, 100) ||
      !text(node.tag, 80) ||
      !text(node.selector, 200) ||
      !text(node.path, 4000) ||
      !kinds.has(node.kind as string)
    )
      return false;
    if (
      !Array.isArray(node.children) ||
      node.children.length > value.length ||
      node.children.some((child) => !id(child)) ||
      new Set(node.children).size !== node.children.length
    )
      return false;
    if (seen.size === 0 ? node.parentId !== null : !id(node.parentId) || !seen.has(node.parentId))
      return false;
    seen.set(node.id, node as unknown as InspectorNode);
  }
  for (const node of seen.values()) {
    if (node.children.some((child) => seen.get(child)?.parentId !== node.id)) return false;
    if (node.parentId !== null && !seen.get(node.parentId)?.children.includes(node.id))
      return false;
  }
  return true;
}

export function readInspectorReport(value: unknown): InspectorReport | null {
  if (
    !object(value) ||
    !text(value.session, 128) ||
    !value.session ||
    !text(value.connection, 128) ||
    !value.connection
  )
    return null;
  let valid = false;
  switch (value.type) {
    case 'ryugi:inspect:tree': {
      valid = typeof value.truncated === 'boolean' && validTree(value.nodes);
      break;
    }
    case 'ryugi:inspect:hover': {
      valid = rect(value.rect) && (value.id === undefined || value.id === null || id(value.id));
      break;
    }
    case 'ryugi:inspect:rect': {
      valid = id(value.id) && value.rect !== null && rect(value.rect);
      break;
    }
    case 'ryugi:inspect:selection': {
      if (
        !['user', 'command', 'update', 'primary'].includes(value.reason as string) ||
        (value.toggle !== undefined && typeof value.toggle !== 'boolean')
      )
        break;
      const node = value.selection;
      valid =
        node === null ||
        (object(node) &&
          id(node.id) &&
          text(node.name, 100) &&
          text(node.tag, 80) &&
          text(node.selector, 200) &&
          node.rect !== null &&
          rect(node.rect) &&
          text(node.html, 20000) &&
          ['fixed', 'fill', 'hug'].includes(node.widthMode as string) &&
          ['fixed', 'hug'].includes(node.heightMode as string) &&
          object(node.css) &&
          INSPECTOR_PROPERTIES.every((key) =>
            text((node.css as Record<string, unknown>)[key], 2000),
          ));
      break;
    }
    case 'ryugi:inspect:targets': {
      valid =
        id(value.request) &&
        Array.isArray(value.targets) &&
        value.targets.length <= 2500 &&
        new Set(value.targets.map((node) => (object(node) ? node.id : null))).size ===
          value.targets.length &&
        value.targets.every(
          (node) =>
            object(node) &&
            id(node.id) &&
            text(node.name, 100) &&
            node.rect !== null &&
            rect(node.rect),
        );
      break;
    }
    case 'ryugi:inspect:details': {
      valid =
        id(value.request) &&
        Array.isArray(value.nodes) &&
        value.nodes.length <= 2500 &&
        value.nodes.every(
          (node) => object(node) && id(node.id) && text(node.text, 200) && text(node.html, 2000),
        );
      break;
    }
    case 'ryugi:inspect:drag': {
      valid =
        ['start', 'move', 'end', 'cancel'].includes(value.phase as string) &&
        number(value.x) &&
        number(value.y) &&
        typeof value.append === 'boolean' &&
        (value.id === undefined || id(value.id));
      break;
    }
    case 'ryugi:inspect:tweaks': {
      valid =
        Array.isArray(value.tweaks) &&
        value.tweaks.length <= 2500 &&
        value.tweaks.every(
          (item) =>
            object(item) &&
            id(item.id) &&
            text(item.name, 200) &&
            property(item.property) &&
            text(item.from, 2000) &&
            text(item.value, 300),
        );
      break;
    }
    case 'ryugi:inspect:wheel': {
      valid =
        number(value.deltaX) &&
        number(value.deltaY) &&
        number(value.x) &&
        number(value.y) &&
        typeof value.zoom === 'boolean';
      break;
    }
    case 'ryugi:inspect:pan': {
      valid = number(value.deltaX) && number(value.deltaY);
      break;
    }
    case 'ryugi:inspect:key': {
      valid =
        text(value.code, 32) &&
        text(value.key, 32) &&
        ['down', 'ctrlKey', 'metaKey', 'shiftKey', 'altKey'].every(
          (key) => typeof value[key] === 'boolean',
        );
      break;
    }
  }
  return valid ? (value as unknown as InspectorReport) : null;
}
