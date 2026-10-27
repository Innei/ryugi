// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

const boxes: HTMLElement[] = [];

afterEach(async () => {
  await act(async () => boxes.splice(0).forEach((box) => box.remove()));
});

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.dataset.theme = 'dark';
  await import('../src/runtime/index');
});

async function mount(html: string) {
  const box = document.createElement('div');
  boxes.push(box);
  await act(async () => {
    box.innerHTML = html;
    document.body.append(box);
  });
  return box;
}

describe('runtime elements', () => {
  test('preserves the page theme selected before the runtime loads', () => {
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  test('option children are read, not left visible in the light DOM', async () => {
    const box = await mount(
      '<ryugi-segmented value="x"><ryugi-segment value="x">X</ryugi-segment><ryugi-segment value="y">Y</ryugi-segment></ryugi-segmented>',
    );
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

  test('button icons use the shared icon renderer at the component size', async () => {
    const box = await mount(
      '<ryugi-button icon="message-square" size="small">Comment</ryugi-button>',
    );
    expect(box.querySelector('button ryugi-icon')?.getAttribute('name')).toBe('message-square');
    expect(box.querySelector('button ryugi-icon')?.getAttribute('size')).toBe('14');
    expect(box.querySelector('button [role="img"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('popover provides one native trigger and opens its content', async () => {
    const box = await mount(
      '<ryugi-popover id="details" content="Copied links stay private">Details</ryugi-popover>',
    );
    expect(box.querySelectorAll('button')).toHaveLength(1);
    const clicked: Event[] = [];
    box.addEventListener('click', (event) => clicked.push(event));
    await act(async () => box.querySelector<HTMLButtonElement>('button')!.click());
    expect(document.body.textContent).toContain('Copied links stay private');
    expect(box.querySelector('button')?.textContent).toBe('Details');
    expect(clicked).toHaveLength(1);
  });

  test('tooltip provides one native trigger with its label', async () => {
    const box = await mount('<ryugi-tooltip content="Copy link" open>Copy</ryugi-tooltip>');
    expect(document.body.textContent).toContain('Copy link');
    expect(box.querySelectorAll('button')).toHaveLength(1);
    expect(box.querySelector('button')?.textContent).toBe('Copy');
  });

  test('menu options emit the selected action and keep disabled actions disabled', async () => {
    const box = await mount(
      '<ryugi-menu id="actions" label="More"><ryugi-menu-item value="copy" icon="copy">Copy link</ryugi-menu-item><ryugi-menu-item value="delete" disabled>Delete</ryugi-menu-item></ryugi-menu>',
    );
    const selected: unknown[] = [];
    box.addEventListener('ryugi-change', (event) =>
      selected.push((event as CustomEvent).detail.value),
    );
    expect(box.querySelector('ryugi-menu-item')).toBeNull();
    await act(async () => box.querySelector('button')!.click());
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(['Copy link', 'Delete']);
    expect(items[1]?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => items[0]!.click());
    expect(selected).toEqual(['copy']);
  });

  test('disabling a menu disables its native trigger', async () => {
    const box = await mount(
      '<ryugi-menu disabled label="Unavailable"><ryugi-menu-item value="copy">Copy</ryugi-menu-item></ryugi-menu>',
    );
    expect(box.querySelector('button')?.disabled).toBe(true);
  });
});
