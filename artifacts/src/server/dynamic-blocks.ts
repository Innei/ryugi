import fs from 'node:fs';
import path from 'node:path';

import { DYNAMIC_URL } from '../shared/dynamic';
import { stripOpaque, TAG } from './balance';
import { URL_ATTR } from './document-codec';

interface FileState {
  errors: string[];
  mtime: number;
  ran: boolean;
}

export interface DynamicState {
  dynamic: Record<string, { ran: boolean }>;
  warnings: string[];
}

export function dynamicUrls(xml: string): string[] {
  const urls = new Set<string>();
  for (const match of stripOpaque(xml).matchAll(TAG)) {
    if (match[1] || match[2]!.toLowerCase() !== 'dynamic') continue;
    const url = URL_ATTR.exec(match[0]);
    const value = url?.[1] ?? url?.[2] ?? '';
    if (DYNAMIC_URL.test(value)) urls.add(value);
  }
  return [...urls];
}

const mtimeOf = (file: string) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return -1;
  }
};

export function createDynamicBlocks(limits: { maxErrors: number }) {
  const byDocument = new Map<string, Map<string, FileState>>();
  const files = (id: string) => {
    let map = byDocument.get(id);
    if (!map) {
      map = new Map();
      byDocument.set(id, map);
    }
    return map;
  };
  const entry = (id: string, dir: string, file: string) => {
    const map = files(id);
    const mtime = mtimeOf(path.join(dir, file));
    let state = map.get(file);
    if (!state || state.mtime !== mtime) {
      state = { mtime, errors: [], ran: false };
      map.set(file, state);
    }
    return state;
  };

  return {
    accepts: (file: unknown): file is string => typeof file === 'string' && DYNAMIC_URL.test(file),
    report(id: string, dir: string, file: string, message: string): boolean {
      const state = entry(id, dir, file);
      if (state.errors.includes(message) || state.errors.length >= limits.maxErrors) return false;
      state.errors.push(message);
      return true;
    },
    loaded(id: string, dir: string, file: string): boolean {
      const state = entry(id, dir, file);
      if (state.ran) return false;
      state.ran = true;
      return true;
    },
    state(id: string, dir: string): DynamicState {
      let xml: string;
      try {
        xml = fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8');
      } catch {
        return { warnings: [], dynamic: {} };
      }
      const urls = dynamicUrls(xml);
      const map = files(id);
      for (const [file, state] of map) {
        if (!urls.includes(file) || state.mtime !== mtimeOf(path.join(dir, file))) map.delete(file);
      }
      const warnings: string[] = [];
      const dynamic: DynamicState['dynamic'] = {};
      for (const url of urls) {
        if (!fs.existsSync(path.join(dir, url))) warnings.push(`${url} not found`);
        const state = map.get(url);
        for (const error of state?.errors ?? []) warnings.push(`runtime: ${url}: ${error}`);
        dynamic[url] = { ran: state?.ran ?? false };
      }
      return { warnings, dynamic };
    },
  };
}
