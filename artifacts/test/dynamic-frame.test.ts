import { expect, test } from 'vitest';
import { clampFrameHeight, dynamicFrameSrc } from '../src/viewer/document/dynamicFrame';

test('the frame src is the asset under the content base, versioned, with props in the hash', () => {
  const src = dynamicFrameSrc('/c/t/document/spec/', 'assets/tuner.html', 3, { radius: 8 });
  expect(src).toBe(
    `/c/t/document/spec/assets/tuner.html?v=3#ryugi-props=${encodeURIComponent('{"radius":8}')}`,
  );
});

test('a block without props gets no hash', () => {
  expect(dynamicFrameSrc('/c/t/document/spec/', 'assets/tuner.html', 0, {})).toBe(
    '/c/t/document/spec/assets/tuner.html?v=0',
  );
});

test('reported heights are clamped to 80–2000 px', () => {
  expect(clampFrameHeight(10)).toBe(80);
  expect(clampFrameHeight(412.4)).toBe(413);
  expect(clampFrameHeight(99999)).toBe(2000);
  expect(clampFrameHeight(Number.NaN)).toBeNull();
});

test.each(['../../html/other/index.html', 'https://example.com/x.html', 'assets/x.js'])(
  'no frame for a url outside assets/<name>.html: %s',
  (url) => {
    expect(dynamicFrameSrc('/c/t/document/spec/', url, 0, {})).toBeNull();
  },
);
