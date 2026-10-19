// Excalidraw and some haklex dependencies read Node globals at import time.
const globals = window as unknown as Record<string, unknown>;
globals.global ??= window;
globals.process ??= { env: {} };

export {};
