'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const line = (message) => `${JSON.stringify(message)}\n`;

// A hub started in this home outlives the test that started it; its home is the only lead to it.
function stopHubIn(home) {
  try {
    process.kill(Number(fs.readFileSync(path.join(home, 'server.pid'), 'utf8')), 'SIGTERM');
  } catch {}
}

function fakeHub(t) {
  const dir = fs.mkdtempSync('/tmp/fhub-');
  const socketPath = path.join(dir, 'hub.sock');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fhub-home-'));
  fs.writeFileSync(path.join(home, 'server-stopped'), JSON.stringify({ reason: 'stop' }));
  const received = [];
  const sessions = new Map();
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const message = JSON.parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        received.push({ ...message, from: socket.session });
        if (message.t !== 'hello') continue;
        const previous = sessions.get(message.session);
        if (previous && previous !== socket) previous.end(line({ t: 'bye', reason: 'replaced' }));
        socket.session = message.session;
        sessions.set(message.session, socket);
        socket.write(line({ t: 'welcome', version: '9.9.9' }));
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      if (sessions.get(socket.session) === socket) sessions.delete(socket.session);
    });
  });
  server.listen(socketPath);
  t.after(
    () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(resolve);
        stopHubIn(home);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }),
  );
  return {
    // Launchers follow ~/.ryugi/dev.json ahead of the CLI a test hands them, and that real CLI
    // starts a real hub in this home; a missing link file turns the machine's link off.
    env: {
      RYUGI_HUB_SOCKET: socketPath,
      RYUGI_SERVER_HOME: home,
      RYUGI_DEV_LINK: path.join(dir, 'no-dev-link.json'),
    },
    received,
    sessions,
    hellos: () => received.filter((message) => message.t === 'hello'),
    delivered: () => received.filter((message) => message.t === 'delivered').map((m) => m.id),
    send: (session, message) => sessions.get(session)?.write(line(message)),
  };
}

module.exports = { fakeHub };
