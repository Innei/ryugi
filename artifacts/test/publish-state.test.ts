import { describe, expect, test } from 'vitest';
import { ownLink, publishState, syncNote } from '../src/shared/cloud';

const cloud = { id: 'c1', url: 'https://ryugi.innei.dev/a/c1', publishedAt: '2026-10-20T08:00:00Z', visibility: 'private' as const };

describe('publishState', () => {
  test('an artifact without a config entry is unpublished and private', () => {
    expect(publishState(undefined)).toEqual({ published: false, visibility: 'private', url: null, synced: true });
  });

  test('a published artifact whose local visibility matches the cloud is in sync', () => {
    expect(publishState({ visibility: 'private', cloud })).toEqual({ published: true, visibility: 'private', url: cloud.url, synced: true });
  });

  test('a cloud copy that was created but never got a version is not published', () => {
    expect(publishState({ visibility: 'private', cloud: { ...cloud, publishedAt: null } })).toEqual({ published: false, visibility: 'private', url: null, synced: true });
  });

  test('a hand-edited visibility that the cloud has not seen yet is out of sync', () => {
    expect(publishState({ visibility: 'public', cloud }).synced).toBe(false);
  });
});

describe('ownLink', () => {
  test('marks a cloud link as opened from this computer when its host id is known', () => {
    expect(ownLink('https://cloud.example/a/c1', 'abcdefghijklmnop1234')).toBe('https://cloud.example/a/c1#ryugi-host=abcdefghijklmnop1234');
    expect(ownLink('https://cloud.example/a/c1', null)).toBe('https://cloud.example/a/c1');
  });
});

describe('syncNote', () => {
  test('says nothing until the comparison is known', () => {
    expect(syncNote(null, true)).toBeNull();
  });

  test('says the cloud copy is current', () => {
    expect(syncNote(true, true)).toBe('upToDate');
  });

  test('names unpublished changes and when auto-follow will send them', () => {
    expect(syncNote(false, false)).toBe('localChanges');
    expect(syncNote(false, true)).toBe('localChangesAuto');
  });
});
