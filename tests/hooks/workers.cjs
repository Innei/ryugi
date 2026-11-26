'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Watchers started through ensure, the launcher or launch-prepare detach from the test process,
// so only the worker files under the plugin data directory lead back to them. A test that fails
// before its own stop would otherwise leave them retrying a hub that is gone.
function stopWorkers(data) {
  if (!fs.existsSync(data)) return;
  for (const entry of fs.readdirSync(data, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    if (!entry.isFile() || !file.endsWith('.json') || !file.split(path.sep).includes('workers'))
      continue;
    try {
      process.kill(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 'SIGTERM');
    } catch {}
  }
}

module.exports = { stopWorkers };
