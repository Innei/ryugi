import { afterEach, expect, test } from 'vitest';

import { i18n } from '../src/viewer/i18n';
import { errorText, responseErrorText } from '../src/viewer/lib/error-text';

afterEach(() => i18n.changeLanguage('en'));

test('a known code is shown in the viewer language', async () => {
  expect(errorText('rate_limited', 'Too many requests; slow down.')).toBe(
    'Too many requests. Wait a moment and try again.',
  );
  await i18n.changeLanguage('zh');
  expect(errorText('rate_limited', 'Too many requests; slow down.')).toBe(
    '请求太频繁，稍等一会儿再试。',
  );
});

test('an unknown or missing code keeps the server message', () => {
  expect(errorText('brand_new_code', 'Something new happened.')).toBe('Something new happened.');
  expect(errorText(undefined, 'No code here.')).toBe('No code here.');
});

test('a plan limit from the local server is explained with the limit it hit', async () => {
  const body = {
    code: 'plan_limit',
    error: 'Free plan allows 3 private artifacts',
    limit: { kind: 'private', used: 3, max: 3 },
  };
  expect(responseErrorText(body, 'fallback')).toBe(
    'All 3 private slots on the free plan are used.',
  );
  await i18n.changeLanguage('zh');
  expect(responseErrorText(body, 'fallback')).toBe(i18n.t('planLimit.private', { max: 3 }));
  expect(responseErrorText(body, 'fallback')).not.toBe(
    'All 3 private slots on the free plan are used.',
  );
});

test('a response without a usable limit keeps its message, or the fallback when it has none', () => {
  expect(responseErrorText({ code: 'plan_limit', error: 'Over the limit' }, 'fallback')).toBe(
    'Over the limit',
  );
  expect(responseErrorText({}, 'fallback')).toBe('fallback');
});
