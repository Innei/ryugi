import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { credentialsFile, readCredentials } from '../server/credentials';

interface LoginHint {
  agentInstruction: string;
  command: string;
  message: string;
  projectDir: string;
}

export function takeLoginHint(projectDir: string): LoginHint | undefined {
  const file = credentialsFile(process.env, process.platform, os.homedir());
  const origin = (process.env.RYUGI_CLOUD_ORIGIN || 'https://ryugi.innei.dev').replace(/\/+$/, '');
  if (readCredentials(file, origin)) return;
  const marker = path.join(path.dirname(file), 'login-hint-shown');
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true, mode: 0o700 });
    fs.writeFileSync(marker, '1\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    // Remembering a recommendation must never prevent local use.
  }
  return {
    message:
      'Recommended: sign in to Ryugi Cloud to share artifacts and review them from other devices. Sign-in is optional; local work can continue.',
    command: `${process.env.RYUGI_ARTIFACTS_COMMAND || 'npx ryugi-artifacts'} publish --login`,
    projectDir,
    agentInstruction:
      'Briefly pass this recommendation to your human partner and offer to run command in projectDir to obtain the sign-in URL. Continue the current task without waiting for sign-in.',
  };
}

export function loginHintText(value: unknown): string | undefined {
  if (!value) return;
  const hint = value as LoginHint;
  return `${hint.message}\nIn ${hint.projectDir}, run \`${hint.command}\` to sign in.`;
}
