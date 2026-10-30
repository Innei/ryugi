# ryugi-detect-agent

Names the coding agent a process runs under, from its environment. No dependencies.

```js
import { detectAgent } from 'ryugi-detect-agent';

detectAgent(process.env); // 'Claude Code' | 'Codex' | 'Cursor' | … | undefined
```

`AI_AGENT` (`name@version` or Claude Code's `name_version_mode`) wins over tool-specific markers. Agents that also set another tool's markers (Cowork, OMP and Grok set `CLAUDECODE`; Kilo sets OpenCode's) are checked first.

`AGENT_MARKERS` lists every variable `detectAgent` reads, for callers that capture the environment to replay it later. `AGENT_DISPLAY_NAMES` lists every name it can return.
