// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, test } from 'vitest';

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await import('../src/runtime/index');
});

async function mount(html: string) {
  const box = document.createElement('div');
  await act(async () => {
    box.innerHTML = html;
    document.body.append(box);
  });
  return box;
}

describe('runtime elements', () => {
  test('option children are read, not left visible in the light DOM', async () => {
    const box = await mount('<ryugi-segmented value="x"><ryugi-segment value="x">X</ryugi-segment><ryugi-segment value="y">Y</ryugi-segment></ryugi-segmented>');
    const el = box.querySelector('ryugi-segmented')!;
    expect(el.querySelector(':scope > ryugi-segment')).toBeNull();
    expect((el as unknown as { optionList: unknown[] }).optionList).toHaveLength(2);
  });

  test('slotted children move into the rendered component', async () => {
    const box = await mount('<ryugi-button>Add <b>one</b></ryugi-button>');
    const el = box.querySelector('ryugi-button')!;
    expect(el.querySelector('button b')?.textContent).toBe('one');
    expect([...el.childNodes].every((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
  });
});
