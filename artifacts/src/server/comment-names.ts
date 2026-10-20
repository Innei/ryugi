import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { Person } from '../shared/comments';
import { detectAgent } from './agent';
import { githubAvatar, gravatarAvatar } from './avatars';
import type { CloudOptions } from './cloud';
import { readCredentials } from './credentials';

export interface CommentNames {
  human(): Person | undefined;
  agent(): string | undefined;
}

interface Options {
  agentFile: string;
  projectDir: string;
  cloud?: CloudOptions;
}

function gitConfig(cwd: string, key: string): string | undefined {
  try {
    return execFileSync('git', ['config', key], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function gitPerson(cwd: string): Person | undefined {
  const name = gitConfig(cwd, 'user.name');
  if (!name) return undefined;
  const email = gitConfig(cwd, 'user.email');
  return email ? { name, avatar: gravatarAvatar(email) } : { name };
}

export function commentNames({ agentFile, projectDir, cloud }: Options): CommentNames {
  let git: { person: Person | undefined } | undefined;
  return {
    human: () => {
      const login = cloud ? readCredentials(cloud.credentialsFile, cloud.origin)?.login : undefined;
      if (login) return { name: login, avatar: githubAvatar(login) };
      git ??= { person: gitPerson(projectDir) };
      return git.person;
    },
    agent: () => {
      try {
        return detectAgent(JSON.parse(fs.readFileSync(agentFile, 'utf8')) as Record<string, string>);
      } catch {
        return undefined;
      }
    },
  };
}
