import fs from 'node:fs';
import path from 'node:path';
import { randomToken, readPersisted } from './http';

export function hostIdFor(credentialsFile: string) {
  const file = path.join(path.dirname(credentialsFile), 'host-id');
  const saved = readPersisted(file);
  if (/^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  const id = randomToken();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${id}\n`, { mode: 0o600 });
  return id;
}
