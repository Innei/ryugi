import { sleep } from './cdp.mjs';
import { measure } from './run.mjs';

const HOLD_MS = 10000;

await measure(process.argv.slice(2), async (chrome) => {
  await chrome.evaluate(`PERF.fit()`);
  await sleep(HOLD_MS);
  const held = await chrome.footprint();
  const phase = (name) => chrome.evaluate(`window.__phase = ${JSON.stringify(name)}`);
  const memory = {};
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const name = await chrome.evaluate('window.__phase ?? null').catch(() => null);
      const total = await chrome.footprint();
      if (name) memory[name] = total;
      await sleep(500);
    }
  })();
  await phase(null);
  const result = await chrome.evaluate(`(async () => {
    const { slots, focus, fit, sleep, raf, wheel, zoomTo, record, view } = PERF;
    const boards = slots();
    const at = (i) => boards[Math.min(i, boards.length - 1)].id;
    fit();
    await sleep(500);
    const overview = view().k;
    const stop = record();
    window.__phase = 'overview'; await sleep(2500); window.__phase = null;
    await focus(at(8), 0.5, 900); await sleep(2500);
    { const t0 = performance.now(); let last = t0; while (performance.now() - t0 < 3000) { await raf(); const now = performance.now(); wheel((now - last) * 0.8, 0, false); last = now; } }
    await sleep(2500);
    await focus(at(11), 1, 700); await sleep(2500);
    for (let i = 0; i < 50; i++) { await raf(); wheel(0, 8, true); }
    await zoomTo(overview, 18);
    window.__phase = 'overview again'; await sleep(2500); window.__phase = null;
    await focus(at(31), 0.5, 900); await sleep(3000);
    return stop();
  })()`);
  sampling = false;
  await sampler;
  return `scenario: ${result.over25} frames over 25 ms of ${result.frames}, p95 ${result.p95} ms, blank ${result.blankPct}% (${result.blankFrames} frames) | renderer+GPU after ${HOLD_MS / 1000} s at overview ${held} MB; during the run at overview ${memory.overview} MB, again ${memory['overview again']} MB`;
});
