import { existsSync, readFileSync } from 'node:fs';
import { type HTMLElement, Window } from 'happy-dom';
import { afterEach, expect, test } from 'vitest';
import { injectRuntime } from '../src/server/inject';

const example = new URL('../../skills/artifacts/examples/today-inbox.html', import.meta.url);
let page: Window | undefined;

afterEach(async () => {
  await page?.happyDOM.close();
});

function openExample(injected = false) {
  expect(existsSync(example), 'the documented prototype must be runnable').toBe(true);
  page = new Window({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  const html = readFileSync(example, 'utf8');
  page.document.write(injected ? injectRuntime(html, { inspector: true }) : html);
  return page.document;
}

test.each([
  ['research', 'writing'],
  ['writing', 'research'],
])('dismissing %s then %s updates the count and reaches the empty state', (first, second) => {
  const document = openExample();
  const count = document.getElementById('count')!;
  const empty = document.querySelector<HTMLElement>('#empty')!;
  expect(count.textContent).toBe('2');
  expect(empty.hidden).toBe(true);

  document.querySelector<HTMLElement>(`#dismiss-${first}`)!.click();
  expect(count.textContent).toBe('1');
  expect(document.querySelector<HTMLElement>(`#card-${first}`)!.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>(`#card-${second}`)!.hidden).toBe(false);
  expect(empty.hidden).toBe(true);

  document.querySelector<HTMLElement>(`#dismiss-${second}`)!.click();
  expect(count.textContent).toBe('0');
  expect(document.querySelector<HTMLElement>('#cards')!.hidden).toBe(true);
  expect(empty.hidden).toBe(false);
  expect(document.activeElement?.id).toBe('open-loops');
});

test('host parameter changes update the example while preserving dismissed cards', () => {
  const document = openExample(true);
  let ready: any;
  page!.parent.postMessage = (data: any) => {
    if (data.type === 'ryugi:tweaks:ready') ready = data;
  };
  const command = (data: object) =>
    page!.eval(
      `dispatchEvent(new MessageEvent('message',{source:parent,data:${JSON.stringify({ type: 'ryugi:tweaks', connection: 'example', ...data })}}))`,
    );
  command({ action: 'connect' });
  document.querySelector<HTMLElement>('#dismiss-research')!.click();
  const set = (count: number) =>
    command({
      action: 'set',
      session: ready?.session,
      values: { accent: '#355ecb', density: 'compact', count, showLoops: false },
    });
  set(1);
  expect(document.querySelector<HTMLElement>('#empty')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('#open-loops')!.hidden).toBe(true);
  set(2);
  expect(document.getElementById('count')!.textContent).toBe('1');
  expect(document.querySelector<HTMLElement>('#card-research')!.hidden).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--tweak-accent')).toBe('#355ecb');
});

test('opening and closing the sheet preserves dismissals, while a fresh frame resets them', async () => {
  const document = openExample();
  document.querySelector<HTMLElement>('#dismiss-research')!.click();
  document.querySelector<HTMLElement>('#open-loops')!.click();
  const sheet = document.querySelector('dialog')!;
  expect(sheet.open).toBe(true);
  document.querySelector<HTMLElement>('#close-loops')!.click();
  expect(sheet.open).toBe(false);
  expect(document.getElementById('count')!.textContent).toBe('1');
  expect(document.querySelector<HTMLElement>('#card-research')!.hidden).toBe(true);

  document.querySelector<HTMLElement>('#dismiss-writing')!.click();
  document.querySelector<HTMLElement>('#open-loops')!.click();
  document.querySelector<HTMLElement>('#close-loops')!.click();
  expect(document.querySelector<HTMLElement>('#empty')!.hidden).toBe(false);
  await page!.happyDOM.close();
  const fresh = openExample();
  expect(fresh.getElementById('count')!.textContent).toBe('2');
  expect(fresh.querySelector<HTMLElement>('#empty')!.hidden).toBe(true);
  expect(fresh.querySelector('dialog')!.open).toBe(false);
});
