// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { readTweakSchema, reconcileTweakValues } from '../src/shared/tweaks';
import { TweaksPanel } from '../src/viewer/tweaks/TweaksPanel';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

test('both enum presentations associate the parameter name with their choices', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const schema = readTweakSchema({
    version: 1,
    controls: {
      density: {
        type: 'enum',
        label: 'Density',
        default: 'comfortable',
        options: ['comfortable', 'compact'],
      },
      theme: {
        type: 'enum',
        label: 'Theme',
        default: 'warm',
        options: ['warm', 'cool', 'neutral', 'custom'],
      },
    },
  }).schema!;
  try {
    await act(async () =>
      root.render(
        <ConfigProvider enableCustomFonts={false} motion={motion}>
          <TweaksPanel
            boardId="main"
            state={{ schema, error: null, values: reconcileTweakValues(schema) }}
            title="Main"
            onChange={() => {}}
            onClose={() => {}}
            onReset={() => {}}
          />
        </ConfigProvider>,
      ),
    );
    const choices = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'comfortable',
    )!;
    const fieldset = choices.closest('fieldset');
    expect(fieldset?.querySelector('legend')?.textContent).toBe('Density');
    expect(
      fieldset?.contains(
        [...host.querySelectorAll('button')].find((button) => button.textContent === 'compact')!,
      ),
    ).toBe(true);
    const select = host.querySelector<HTMLElement>('[role="combobox"]')!;
    const label = [...host.querySelectorAll('label')].find(
      (element) => element.htmlFor === select.id,
    );
    expect(label?.textContent).toBe('Theme');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
