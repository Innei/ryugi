import { describe, expect, test } from 'vitest';

import { cloudErrorDetails } from '../src/shared/cloud-error';

describe('cloudErrorDetails', () => {
  test('keeps every plan the cloud can name', () => {
    expect(cloudErrorDetails({ plan: 'max' }).plan).toBe('max');
    expect(cloudErrorDetails({ plan: 'pro' }).plan).toBe('pro');
    expect(cloudErrorDetails({ plan: 'ultra' }).plan).toBeUndefined();
  });
});
