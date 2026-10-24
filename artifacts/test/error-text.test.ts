import { afterEach, expect, test } from 'vitest';
import { i18n } from '../src/viewer/i18n';
import { errorText } from '../src/viewer/lib/error-text';

afterEach(() => i18n.changeLanguage('en'));

test('a known code is shown in the viewer language', async () => {
  expect(errorText('rate_limited', 'Too many requests; slow down.')).toBe('Too many requests. Wait a moment and try again.');
  await i18n.changeLanguage('zh');
  expect(errorText('rate_limited', 'Too many requests; slow down.')).toBe('请求太频繁，稍等一会儿再试。');
});

test('an unknown or missing code keeps the server message', () => {
  expect(errorText('brand_new_code', 'Something new happened.')).toBe('Something new happened.');
  expect(errorText(undefined, 'No code here.')).toBe('No code here.');
});
