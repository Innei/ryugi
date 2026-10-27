import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { setProjectAutoPublish } from '../src/server/config';
import {
  autoPublishEnabled,
  defaultGlobalAutoPublish,
  readGlobalAutoPublish,
  settingsFileFor,
  writeGlobalAutoPublish,
} from '../src/server/settings';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-settings-'));

describe('global settings', () => {
  test('live next to the credentials file', () => {
    expect(settingsFileFor('/home/u/.config/ryugi/credentials.json')).toBe(
      path.join('/home/u/.config/ryugi', 'config.json'),
    );
  });

  test('read as undecided when the file or the key is missing', () => {
    const file = path.join(tempDir(), 'config.json');
    expect(readGlobalAutoPublish(file)).toBeUndefined();
    fs.writeFileSync(file, '{"other":1}');
    expect(readGlobalAutoPublish(file)).toBeUndefined();
    fs.writeFileSync(file, '{oops');
    expect(readGlobalAutoPublish(file)).toBeUndefined();
  });

  test('writing keeps other keys', () => {
    const file = path.join(tempDir(), 'config.json');
    fs.writeFileSync(file, '{"other":1}');
    writeGlobalAutoPublish(file, false);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ other: 1, autoPublish: false });
    expect(readGlobalAutoPublish(file)).toBe(false);
  });

  test('the sign-in default turns it on only when undecided', () => {
    const file = path.join(tempDir(), 'nested', 'config.json');
    defaultGlobalAutoPublish(file);
    expect(readGlobalAutoPublish(file)).toBe(true);
    writeGlobalAutoPublish(file, false);
    defaultGlobalAutoPublish(file);
    expect(readGlobalAutoPublish(file)).toBe(false);
  });
});

describe('autoPublishEnabled', () => {
  const setup = (global: boolean | undefined, project: boolean | null) => {
    const dir = tempDir();
    const globalFile = path.join(dir, 'global.json');
    const projectFile = path.join(dir, 'project.json');
    if (global !== undefined) writeGlobalAutoPublish(globalFile, global);
    setProjectAutoPublish(projectFile, project);
    return { globalFile, projectFile };
  };

  test('is off while undecided', () => {
    expect(autoPublishEnabled(setup(undefined, null))).toBe(false);
  });

  test('follows the global value without a project value', () => {
    expect(autoPublishEnabled(setup(true, null))).toBe(true);
    expect(autoPublishEnabled(setup(false, null))).toBe(false);
  });

  test('lets the project value win either way', () => {
    expect(autoPublishEnabled(setup(true, false))).toBe(false);
    expect(autoPublishEnabled(setup(false, true))).toBe(true);
    expect(autoPublishEnabled(setup(undefined, true))).toBe(true);
  });
});
