// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { readTweakSchema, reconcileTweakValues } from '../src/shared/tweaks';
import { i18n } from '../src/viewer/i18n';
import { Layers } from '../src/viewer/inspector/Layers';
import { TweaksPanel } from '../src/viewer/tweaks/TweaksPanel';

afterEach(() => i18n.changeLanguage('en'));

test('inspector and parameter chrome speak Chinese when the viewer does', async () => {
  await i18n.changeLanguage('zh');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const schema = readTweakSchema({
    version: 1,
    controls: { size: { type: 'number', label: 'Size', default: 1, min: 0, max: 2 } },
  }).schema!;
  try {
    await act(async () =>
      root.render(
        <ConfigProvider motion={motion} enableCustomFonts={false}>
          <TweaksPanel
            boardId="main"
            title="Main"
            state={{ schema, error: null, values: reconcileTweakValues(schema) }}
            onChange={() => {}}
            onReset={() => {}}
            onClose={() => {}}
          />
          <Layers
            boards={[]}
            frames={{}}
            selection={null}
            targets={[]}
            playing={new Set()}
            select={() => {}}
            hoverNode={() => {}}
          />
        </ConfigProvider>,
      ),
    );
    const labels = [...host.querySelectorAll('[aria-label]')].map((element) =>
      element.getAttribute('aria-label'),
    );
    expect(labels).toEqual(expect.arrayContaining(['参数', '关闭参数', 'DOM 图层']));
    expect(host.textContent).toContain('图层');
    expect(host.textContent).toContain('当前画板');
    expect(host.textContent).toContain('等画板准备好…');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
