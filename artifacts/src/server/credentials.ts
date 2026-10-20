import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './state';

export interface Credentials {
  origin: string;
  token: string;
  login: string;
}

export function credentialsFile(env: Record<string, string | undefined>, platform: string, home: string) {
  if (platform === 'win32' && env.APPDATA) return path.join(env.APPDATA, 'ryugi', 'credentials.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'ryugi', 'credentials.json');
}

export function readCredentials(file: string, origin: string): Credentials | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { origin: savedOrigin, token, login } = raw as Record<string, unknown>;
  if (typeof savedOrigin !== 'string' || typeof token !== 'string' || typeof login !== 'string') return null;
  if (savedOrigin !== origin) return null;
  return { origin: savedOrigin, token, login };
}

export function writeCredentials(file: string, credentials: Credentials) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeJsonAtomic(file, credentials);
}

export function clearCredentials(file: string) {
  fs.rmSync(file, { force: true });
}
