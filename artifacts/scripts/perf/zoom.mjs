import { measure } from './run.mjs';

await measure(process.argv.slice(2), async (chrome) => {
  const result = await chrome.evaluate(`(async () => {
    const { slots, focus, sleep, raf, wheel, record } = PERF;
    await focus(slots()[0].id, 0.6, 400);
    await sleep(6000);
    const stop = record();
    for (let i = 0; i < 120; i++) { await raf(); wheel(0, i < 60 ? -1.5 : 1.5, true); }
    await sleep(200);
    return stop();
  })()`);
  return `zoom: ${result.over33} frames over 33 ms of ${result.frames}, ${result.over25} over 25 ms, p95 ${result.p95} ms, max ${result.max} ms, blank ${result.blankPct}%`;
});
