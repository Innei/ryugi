export type AgentEnv = Record<string, string | undefined>;

export declare const AGENT_DISPLAY_NAMES: string[];

export declare const AGENT_MARKERS: string[];

export declare function detectAgent(env: AgentEnv): string | undefined;
