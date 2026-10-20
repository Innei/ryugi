import { describe, expect, test } from 'vitest';
import { publishState } from '../src/shared/cloud';

const cloud = { id: 'c1', url: 'https://ryugi.innei.dev/a/c1', publishedAt: '2026-10-20T08:00:00Z', visibility: 'private' as const };

describe('publishState', () => {
  test('an artifact without a config entry is unpublished and private', () => {
    expect(publishState(undefined)).toEqual({ published: false, visibility: 'private', url: null, synced: true });
  });

  test('a published artifact whose local visibility matches the cloud is in sync', () => {
    expect(publishState({ visibility: 'private', cloud })).toEqual({ published: true, visibility: 'private', url: cloud.url, synced: true });
  });

  test('a hand-edited visibility that the cloud has not seen yet is out of sync', () => {
    expect(publishState({ visibility: 'public', cloud }).synced).toBe(false);
  });
});
