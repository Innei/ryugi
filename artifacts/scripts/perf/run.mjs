import { boardCount, launch, parseArgs, startServer, WARM_UP } from './cdp.mjs';

export async function measure(argv, run) {
  const options = parseArgs(argv);
  const boards = boardCount(options);
  const server = startServer(options);
  try {
    for (let round = 0; round < options.rounds; round++) {
      const chrome = await launch();
      try {
        await chrome.open(server.link, boards);
        if (!options.cold) {
          await chrome.evaluate(WARM_UP, 600000);
          await chrome.open(server.link, boards);
        }
        console.log(`${options.cold ? 'cold' : 'warm'} ${await run(chrome)}`);
      } finally {
        await chrome.close();
      }
    }
  } finally {
    server.stop();
  }
}
