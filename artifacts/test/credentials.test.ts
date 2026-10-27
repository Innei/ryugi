import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  clearCredentials,
  credentialsFile,
  readCredentials,
  writeCredentials,
} from '../src/server/credentials';

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-creds-')), 'ryugi', 'credentials.json');

describe('credentialsFile', () => {
  test('lives under XDG_CONFIG_HOME when it is set', () => {
    expect(credentialsFile({ XDG_CONFIG_HOME: '/x/config' }, 'linux', '/home/u')).toBe(
      '/x/config/ryugi/credentials.json',
    );
  });

  test('falls back to ~/.config on macOS and Linux', () => {
    expect(credentialsFile({}, 'darwin', '/Users/u')).toBe(
      '/Users/u/.config/ryugi/credentials.json',
    );
  });

  test('uses APPDATA on Windows', () => {
    expect(
      credentialsFile({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, 'win32', 'C:\\Users\\u'),
    ).toBe(path.join('C:\\Users\\u\\AppData\\Roaming', 'ryugi', 'credentials.json'));
  });
});

describe('credentials', () => {
  test('round-trips and is readable only by the owner', () => {
    const file = tempFile();
    writeCredentials(file, { origin: 'https://ryugi.innei.dev', token: 't0k', login: 'innei' });
    expect(readCredentials(file, 'https://ryugi.innei.dev')).toEqual({
      origin: 'https://ryugi.innei.dev',
      token: 't0k',
      login: 'innei',
    });
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  test('a token for a different cloud origin does not count as signed in', () => {
    const file = tempFile();
    writeCredentials(file, { origin: 'http://localhost:8787', token: 't0k', login: 'innei' });
    expect(readCredentials(file, 'https://ryugi.innei.dev')).toBeNull();
  });

  test('missing or malformed files read as signed out', () => {
    const file = tempFile();
    expect(readCredentials(file, 'https://ryugi.innei.dev')).toBeNull();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"token":1}');
    expect(readCredentials(file, 'https://ryugi.innei.dev')).toBeNull();
  });

  test('clearing removes the file', () => {
    const file = tempFile();
    writeCredentials(file, { origin: 'https://ryugi.innei.dev', token: 't0k', login: 'innei' });
    clearCredentials(file);
    expect(fs.existsSync(file)).toBe(false);
  });
});
