'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const MAX = 8 * 1024 * 1024;
const encode = (value) => {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > MAX) throw new Error('Codex desktop callback request was too large.');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
};
function acknowledged(result, session) {
  const texts = Array.isArray(result?.contentItems)
    ? result.contentItems
        .filter((i) => i?.type === 'inputText' && typeof i.text === 'string')
        .map((i) => i.text)
    : [];
  if (result?.success !== true)
    throw new Error(texts.join('\n').slice(0, 800) || 'Codex desktop rejected the callback.');
  let receipt;
  try {
    if (texts.length !== 1) throw new Error('Missing receipt');
    receipt = JSON.parse(texts[0]);
  } catch {
    throw new Error('Codex desktop returned an invalid callback receipt.');
  }
  if (receipt?.threadId !== session)
    throw new Error('Codex desktop callback receipt does not match the hook session.');
  return texts[0];
}

function deliver({ session, message, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection((process.env.CODEX_APP_TOOLS_PIPE_PATH || '').trim());
    let done = false;
    let id = 1;
    let pending = Buffer.alloc(0);
    const finish = (error, receipt) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(receipt);
    };
    const timer = setTimeout(
      () => finish(new Error('Codex desktop callback timed out. Delivery is unconfirmed.')),
      timeoutMs,
    );
    const request = (method, params) => {
      try {
        socket.write(encode({ jsonrpc: '2.0', id, method, params }));
      } catch (error) {
        finish(error);
      }
    };
    const onClosed = () =>
      finish(
        new Error(
          'Codex desktop pipe closed before acknowledging the callback. Check the inherited CODEX_MCP_NODE_PATH runtime.',
        ),
      );
    socket.on('error', (error) => finish(new Error(`Codex desktop pipe failed: ${error.message}`)));
    socket.on('close', onClosed);
    socket.on('end', onClosed);
    socket.once('connect', () => request('tools/list', { threadStartKind: 'all' }));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (!done && pending.length >= 4) {
        const length = pending.readUInt32LE(0);
        if (length > MAX) return finish(new Error('Codex desktop response was too large.'));
        if (pending.length < length + 4) return;
        const payload = pending.subarray(4, length + 4);
        pending = pending.subarray(length + 4);
        let response;
        try {
          response = JSON.parse(payload.toString('utf8'));
          if (
            !response ||
            response.jsonrpc !== '2.0' ||
            (!Object.hasOwn(response, 'result') && !response.error)
          )
            throw new Error('Invalid response');
        } catch {
          return finish(new Error('Codex desktop returned an invalid native response.'));
        }
        if (response.id !== id) continue;
        if (response.error)
          return finish(
            new Error(`Codex desktop RPC error: ${response.error.message || 'Unknown error'}`),
          );
        try {
          if (id === 1) {
            const tool = response.result?.tools?.find(
              (item) => item?.name === 'send_message_to_thread',
            );
            if (!tool || typeof tool.namespace !== 'string' || !tool.namespace.trim())
              throw new Error(
                'send_message_to_thread is not available in the Codex desktop tool catalog.',
              );
            id = 2;
            const callId = randomUUID();
            request('tools/call', {
              callerSource: 'codex',
              hostId: 'local',
              namespace: tool.namespace,
              tool: 'send_message_to_thread',
              threadId: session,
              turnId: `mcp-turn-${callId}`,
              callId,
              arguments: { threadId: session, hostId: 'local', prompt: message },
            });
          } else {
            finish(null, acknowledged(response.result, session));
          }
        } catch (error) {
          finish(error);
        }
      }
    });
  });
}

process.title = 'Ryugi watch-comments';
const watcher = spawn(process.env.RYUGI_HOOK_SELF, ['codex-watch'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});
watcher.on('error', () => process.exit(1));
watcher.on('exit', (code) => process.exit(code ?? 0));
watcher.stdin.on('error', () => {});
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'])
  process.on(signal, () => watcher.kill('SIGTERM'));
readline.createInterface({ input: watcher.stdout }).on('line', (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {}
  if (request?.ryugi !== 'desktop') return void process.stdout.write(`${line}\n`);
  deliver(request).then(
    (receipt) => watcher.stdin.write(`${JSON.stringify({ id: request.id, receipt })}\n`),
    (error) => watcher.stdin.write(`${JSON.stringify({ id: request.id, error: error.message })}\n`),
  );
});
