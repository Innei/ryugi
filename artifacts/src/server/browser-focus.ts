import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { browserLauncher } from './lifecycle';

const execute = promisify(execFile);

// shortcut: native tab reuse covers macOS Dia, Chrome and Safari; add an adapter when another browser needs reuse.
export const MAC_FOCUS_SCRIPT = String.raw`
function run(urls) {
  function key(url) {
    return String(url).split(/[?#]/)[0].replace(/^(https?:\/\/)127\.0\.0\.1:/, '$1localhost:').replace(/\/$/, '');
  }
  var targets = urls.map(key);
  var ids = ['company.thebrowser.dia', 'com.google.Chrome', 'com.apple.Safari'];
  var unknown = false;
  for (var a = 0; a < ids.length; a++) {
    var app;
    try { app = Application(ids[a]); if (!app.running()) continue; } catch (e) { continue; }
    try {
      var windows = app.windows();
      for (var w = 0; w < windows.length; w++) {
        var tabs = windows[w].tabs();
        for (var t = 0; t < tabs.length; t++) {
          if (targets.indexOf(key(tabs[t].url())) === -1) continue;
          try {
            if (ids[a] === 'company.thebrowser.dia') app.focus(tabs[t]);
            else {
              if (ids[a] === 'com.apple.Safari') windows[w].currentTab = tabs[t];
              else windows[w].activeTabIndex = t + 1;
              windows[w].index = 1;
            }
            app.activate();
          } catch (e) { console.log('Could not focus the existing browser tab: ' + e.message); }
          return 'found';
        }
      }
    } catch (e) { unknown = true; }
  }
  return unknown ? 'unknown' : 'missing';
}`;

export async function openBrowser(url: string, aliases: string[] = []) {
  if (process.platform === 'darwin') {
    const { stdout, stderr } = await execute(
      'osascript',
      ['-l', 'JavaScript', '-e', MAC_FOCUS_SCRIPT, url, ...aliases],
      { timeout: 5000 },
    );
    if (stderr.trim()) console.error(stderr.trim());
    if (stdout.trim() === 'found') return;
    if (stdout.trim() !== 'missing')
      throw new Error('Could not inspect existing browser tabs; open the artifact link manually.');
  }
  const launcher = browserLauncher(process.platform, url);
  if (launcher) await execute(launcher.bin, launcher.args);
}
