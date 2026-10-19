import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  execFileSync('pnpm', ['build'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
}
