import { checkCommand } from './check';
import type { CommandSpec } from './command';
import { commentCommand } from './comment';
import { configCommand } from './config';
import { getCommand } from './get';
import { monitorCommand } from './monitor';
import { publishCommand } from './publish';
import { startCommand } from './start';
import { stopCommand } from './stop';
import { updateCommand } from './update';

export const COMMANDS: CommandSpec[] = [
  startCommand,
  stopCommand,
  checkCommand,
  publishCommand,
  commentCommand,
  getCommand,
  monitorCommand,
  configCommand,
  updateCommand,
];
