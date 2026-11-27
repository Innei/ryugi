import fs from 'node:fs';
import path from 'node:path';

const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

function cli(run) {
  const calls = lines(path.join(run, 'calls.jsonl')).filter((c) => c.args[0] !== 'start' && c.args[0] !== 'stop');
  const launcher = path.join(run, 'adeck');
  let chars = 0, actionChars = 0;
  for (const call of calls) {
    for (const line of call.out.split('\n')) {
      chars += line.length + 1;
      if (/^[A-Z][^:\n]{0,60}: /.test(line) && (line.includes(launcher) || /· (node |ryugi |adeck )/.test(line))) actionChars += line.length + 1;
    }
  }
  const reads = calls.filter((c) => (c.args[0] === 'comment' && ['list', 'read'].includes(c.args[1])) || c.args[0] === 'get');
  const seen = new Map();
  let repeated = 0;
  for (const c of reads) {
    const key = c.args.join(' ') + '\n' + c.out;
    if (seen.has(key)) repeated++;
    seen.set(key, true);
  }
  const acks = calls.filter((c) => (c.args[0] === 'comment' || c.args[0] === 'changes') && c.args[1] === 'ack').length;
  return { cliCalls: calls.length, cliChars: chars, actionChars, utilization: chars ? 1 - actionChars / chars : null, repeatedReads: repeated, acks, failedCalls: calls.filter((c) => c.code !== 0).length };
}

export function claude(run, transcript) {
  const entries = lines(transcript).filter((e) => e.type === 'assistant' && e.message);
  const byId = new Map();
  let toolCalls = 0, docReads = 0;
  for (const e of entries) {
    byId.set(e.message.id, e.message.usage);
    for (const block of e.message.content ?? []) {
      if (block.type !== 'tool_use') continue;
      toolCalls++;
      const text = JSON.stringify(block.input ?? {});
      if (/doc\.xml/.test(text) && !/write-document|writeFile|> /.test(text)) docReads++;
    }
  }
  let input = 0, cached = 0, output = 0;
  for (const u of byId.values()) {
    if (!u) continue;
    input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    cached += u.cache_read_input_tokens ?? 0;
    output += u.output_tokens ?? 0;
  }
  return { host: 'claude', inputTokens: input, cachedTokens: cached, outputTokens: output, totalTokens: input + output, roundTrips: byId.size, toolCalls, docReads, ...cli(run) };
}

export function codex(run) {
  const events = lines(path.join(run, 'events.jsonl'));
  let input = 0, cached = 0, output = 0;
  for (const e of events.filter((e) => e.type === 'turn.completed')) {
    input += e.usage?.input_tokens ?? 0;
    cached += e.usage?.cached_input_tokens ?? 0;
    output += e.usage?.output_tokens ?? 0;
  }
  const commands = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'command_execution');
  const messages = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
  const docReads = commands.filter((e) => /doc\.xml/.test(e.item.command) && /\b(cat|sed|head|tail|less|rg|grep|nl|awk)\b|read_text|read_bytes/.test(e.item.command) && !/write-document/.test(e.item.command)).length;
  return { host: 'codex', inputTokens: input, cachedTokens: cached, outputTokens: output, totalTokens: input + output, roundTrips: commands.length + messages.length, toolCalls: commands.length, docReads, ...cli(run) };
}

const [cmd, run, transcript] = process.argv.slice(2);
if (cmd === 'claude') console.log(JSON.stringify(claude(run, transcript)));
if (cmd === 'codex') console.log(JSON.stringify(codex(run)));
