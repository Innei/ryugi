'use strict';
const fs = require('node:fs');
const path = require('node:path');
const [run, code, out, ...args] = process.argv.slice(2);
const MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_SANDBOX', 'CODEX_CI', 'AI_AGENT'];
const env = Object.fromEntries(MARKERS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
fs.appendFileSync(path.join(run, 'calls.jsonl'), JSON.stringify({ at: Date.now(), args, code: Number(code), out: text, env }) + '\n');
