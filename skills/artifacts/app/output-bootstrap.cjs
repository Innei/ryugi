"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli/output/bootstrap/index.ts
var index_exports = {};
__export(index_exports, {
  reportFailure: () => reportFailure,
  resolveSelection: () => resolveSelection
});
module.exports = __toCommonJS(index_exports);

// <define:BOOTSTRAP_OPTIONS>
var define_BOOTSTRAP_OPTIONS_default = { format: { type: "string" }, detail: { type: "boolean" }, fields: { type: "string" }, quiet: { type: "boolean" }, verbose: { type: "boolean" }, "project-dir": { type: "string" }, json: { type: "boolean" }, artifact: { type: "string" }, host: { type: "string" }, "url-host": { type: "string" }, port: { type: "string" }, open: { type: "boolean" }, "no-open": { type: "boolean" }, foreground: { type: "boolean" }, "no-daemon": { type: "boolean" }, background: { type: "boolean" }, daemon: { type: "boolean" }, visibility: { type: "string" }, type: { type: "string" }, project: { type: "boolean" }, limit: { type: "string" }, cursor: { type: "string" }, public: { type: "boolean" }, private: { type: "boolean" }, unpublish: { type: "boolean" }, list: { type: "boolean" }, delete: { type: "string" }, "with-boards": { type: "boolean" }, login: { type: "boolean" }, logout: { type: "boolean" }, section: { type: "string" }, snapshot: { type: "string" }, receipt: { type: "string" }, status: { type: "string" }, "waiting-on": { type: "string" }, kind: { type: "string" }, "choice-state": { type: "string" }, all: { type: "boolean" }, block: { type: "string" }, quote: { type: "string" }, board: { type: "string" }, x: { type: "string" }, y: { type: "string" }, thread: { type: "string" }, text: { type: "string" }, group: { type: "string" }, clear: { type: "boolean" }, ask: { type: "string" }, choice: { type: "string" }, round: { type: "string" }, withdraw: { type: "boolean" }, save: { type: "string" }, source: { type: "boolean" }, download: { type: "boolean" }, out: { type: "string" }, "no-comments": { type: "boolean" }, "output-format": { type: "string" }, "auto-publish": { type: "string" }, check: { type: "boolean" }, pm: { type: "string" } };

// src/cli/output/configuration.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// src/server/credentials.ts
var import_node_path = __toESM(require("node:path"), 1);

// src/shared/validate.ts
var BOARD_NUMBERS = ["x", "y", "w", "h"];
var BOARD_REQUIRED = ["file", "page", ...BOARD_NUMBERS];
var MEDIA_REQUIRED = ["src", "page", ...BOARD_NUMBERS];

// src/server/credentials.ts
function credentialsFile(env, platform, home) {
  if (platform === "win32" && env.APPDATA)
    return import_node_path.default.join(env.APPDATA, "ryugi", "credentials.json");
  return import_node_path.default.join(env.XDG_CONFIG_HOME || import_node_path.default.join(home, ".config"), "ryugi", "credentials.json");
}

// src/server/settings.ts
var import_node_path2 = __toESM(require("node:path"), 1);

// src/shared/cloud.ts
var MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

// src/server/settings.ts
var settingsFileFor = (credentialsFile2) => import_node_path2.default.join(import_node_path2.default.dirname(credentialsFile2), "config.json");

// src/cli/paths.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var CliError = class extends Error {
  constructor(message, fields = {}, code = 1) {
    super(message);
    this.fields = fields;
    this.code = code;
  }
  fields;
  code;
};
var resolvesRoot = () => !process.env.RYUGI_ARTIFACTS_COMMAND || process.env.RYUGI_ARTIFACTS_RESOLVE_ROOT === "1";
function projectRoot(dir) {
  let home = "";
  try {
    home = import_node_fs.default.realpathSync(import_node_os.default.homedir());
  } catch {
  }
  const chain = [];
  for (let current = dir; ; current = import_node_path3.default.dirname(current)) {
    chain.push(current);
    if (import_node_fs.default.existsSync(import_node_path3.default.join(current, ".git")) && (current !== home || dir === home)) break;
    if (import_node_path3.default.dirname(current) === current) return dir;
  }
  return chain.find((candidate) => import_node_fs.default.existsSync(import_node_path3.default.join(candidate, ".ryugi", "artifacts"))) ?? chain.at(-1);
}
function projectPaths(dir) {
  let project2;
  try {
    project2 = import_node_fs.default.realpathSync(import_node_path3.default.resolve(dir));
    if (!import_node_fs.default.statSync(project2).isDirectory()) throw new Error("Not a directory");
  } catch {
    throw new CliError(`Project directory not found: ${dir}`);
  }
  if (resolvesRoot()) project2 = projectRoot(project2);
  const root = import_node_path3.default.join(project2, ".ryugi", "artifacts");
  const state = import_node_path3.default.join(root, ".state");
  return {
    project: project2,
    root,
    state,
    pid: import_node_path3.default.join(state, "server.pid"),
    log: import_node_path3.default.join(state, "server.log"),
    serverId: import_node_path3.default.join(state, "server-instance-id"),
    info: import_node_path3.default.join(state, "server-info"),
    version: import_node_path3.default.join(state, "server-version"),
    owners: import_node_path3.default.join(state, "owners"),
    agent: import_node_path3.default.join(state, "agent"),
    stopped: import_node_path3.default.join(state, "server-stopped"),
    lock: import_node_path3.default.join(state, "start.lock")
  };
}

// src/cli/output/normalize.ts
var OutputError = class extends Error {
  constructor(error, kind = "failed") {
    super(error.message);
    this.error = error;
    this.kind = kind;
  }
  error;
  kind;
};
function completionState(completion, warning = false) {
  switch (completion.kind) {
    case "succeeded":
      return { outcome: warning ? "attention" : "success", code: 0 };
    case "validation_failed":
      return { outcome: "attention", code: 3 };
    case "pending":
      return { outcome: "pending", code: 4 };
    case "action_required":
      return { outcome: "attention", code: 2 };
    case "partial":
      return { outcome: "partial", code: 5 };
    case "failed":
      return { outcome: "error", code: 1 };
    case "interrupted":
      return { outcome: "error", code: completion.signal === "SIGINT" ? 130 : 143 };
  }
}
function project(value, keys, path5, omitted) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => {
      if (keys.includes(key)) return true;
      omitted.push({ path: `${path5}.${key}`, reason: "fields" });
      return false;
    })
  );
}
function normalize(command, result2, options, policy) {
  const omitted = [...result2.coverage.omitted ?? []];
  let data = result2.data;
  if (options.fields) {
    if (policy.collection && data && typeof data === "object") {
      const record = data;
      const rows = record[policy.collection];
      data = {
        ...record,
        [policy.collection]: Array.isArray(rows) ? rows.map(
          (row, i) => project(row, options.fields, `data.${policy.collection}.${i}`, omitted)
        ) : rows
      };
    } else data = project(data, options.fields, "data", omitted);
  }
  return {
    schema: "ryugi.cli/v1",
    command,
    outcome: completionState(result2.completion, result2.warnings.length > 0).outcome,
    data,
    ...result2.coverage.page ? { page: result2.coverage.page } : {},
    ...omitted.length ? { omitted } : {},
    ...result2.effects.length ? { effects: result2.effects } : {},
    ...result2.warnings.length ? { warnings: result2.warnings } : {},
    ...result2.actions.length ? { next: result2.actions } : {},
    ...result2.completion.kind === "failed" ? { error: result2.completion.error } : {}
  };
}

// src/cli/output/planning.ts
function scanOptions(argv, optionSpecs) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") break;
    if (!token.startsWith("--")) continue;
    const equal = token.indexOf("=");
    const name = token.slice(2, equal < 0 ? void 0 : equal);
    const type = name === "source" ? "boolean" : optionSpecs[name]?.type;
    if (type === "string") values[name] = equal < 0 ? argv[++i] ?? "" : token.slice(equal + 1);
    else if (type === "boolean") values[name] = true;
  }
  return values;
}
function selectOutput(argv, optionSpecs, env = process.env) {
  const values = scanOptions(argv, optionSpecs);
  const explicit = ["format", "json", "quiet", "source"].filter((key) => values[key] !== void 0);
  const configured = env.RYUGI_ARTIFACTS_FORMAT ?? "legacy";
  if (explicit.length === 1 && values.json) return { protocol: "legacy" };
  if (!explicit.length && configured === "legacy" && !values.detail && !values.fields)
    return { protocol: "legacy" };
  const requested = values.format ?? (values.quiet ? "quiet" : values.source ? "source" : configured === "legacy" ? "brief" : configured);
  const formats = ["brief", "table", "json", "jsonl", "raw", "source", "quiet"];
  const valid = formats.includes(requested);
  const options = {
    format: valid ? requested : "brief",
    detail: !!values.detail || !!values.source,
    verbose: !!values.verbose
  };
  let error;
  if (explicit.length > 1)
    error = new OutputError({
      code: "E_OPTION_CONFLICT",
      message: "Choose one of --format, --json, --quiet or --source."
    });
  else if (!valid || !explicit.length && !["brief", "json", "jsonl", "legacy"].includes(configured))
    error = new OutputError({
      code: "E_FORMAT_UNSUPPORTED",
      message: `Unknown output format: ${String(requested)}`
    });
  if (typeof values.fields === "string") {
    options.fields = values.fields.split(",").map((field) => field.trim());
    if (options.fields.some((field) => !field))
      error = new OutputError({
        code: "E_ARGUMENT_INVALID",
        message: "--fields requires comma-separated field names."
      });
  }
  return { protocol: "v1", options, ...error ? { error } : {} };
}

// src/cli/output/configuration.ts
var PERSISTED_FORMATS = ["brief", "json", "jsonl", "legacy"];
function outputFiles(projectDir) {
  return {
    global: settingsFileFor(credentialsFile(process.env, process.platform, import_node_os2.default.homedir())),
    project: import_node_path4.default.join(import_node_path4.default.dirname(projectPaths(projectDir).root), "config.json")
  };
}
function read(file) {
  try {
    const raw = JSON.parse(import_node_fs2.default.readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Expected an object");
    return raw;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new OutputError({
      code: "E_CONFIG_INVALID",
      message: `Cannot read ${file}: ${error.message}`
    });
  }
}
function outputValues(projectDir) {
  const files = outputFiles(projectDir);
  const get = (file) => {
    const output = read(file).output;
    return output && PERSISTED_FORMATS.includes(output.format) ? output.format : null;
  };
  const global = get(files.global), project2 = get(files.project);
  return {
    global,
    project: project2,
    effective: project2 ?? global ?? "legacy",
    source: project2 ? "project" : global ? "global" : "default"
  };
}
function configuredEnvironment(argv, specs, env = process.env) {
  if (env.RYUGI_ARTIFACTS_FORMAT !== void 0) return env;
  const values = scanOptions(argv, specs);
  let project2 = typeof values["project-dir"] === "string" ? values["project-dir"] : process.cwd();
  if (!values["project-dir"] && argv[0] && !argv[0].startsWith("-")) {
    try {
      if (import_node_fs2.default.statSync(argv[0]).isDirectory()) project2 = argv[0];
    } catch {
    }
  }
  const config = outputValues(project2);
  return { ...env, RYUGI_ARTIFACTS_FORMAT: config.effective };
}

// src/cli/output/protocol.ts
function result(data, completion = { kind: "succeeded" }, extra = {}) {
  return { data, completion, coverage: {}, effects: [], warnings: [], actions: [], ...extra };
}

// src/cli/output/bootstrap/index.ts
function resolveSelection(argv) {
  let environment = process.env;
  try {
    environment = configuredEnvironment(argv, define_BOOTSTRAP_OPTIONS_default);
  } catch {
  }
  return selectOutput(argv, define_BOOTSTRAP_OPTIONS_default, environment);
}
function reportFailure(argv, error, selection) {
  const selected = selection ?? resolveSelection(argv);
  const message = error instanceof Error ? error.message : String(error);
  if (selected.protocol === "legacy") {
    process.stdout.write(`${JSON.stringify({ error: message })}
`);
    process.exitCode = 1;
    return;
  }
  const detail = selected.error?.error ?? { code: "E_BOOTSTRAP_FAILED", message };
  const failure = result(null, { kind: "failed", error: detail });
  const wire = {
    ...normalize(
      argv[0] && !argv[0].startsWith("-") ? argv[0] : "browse",
      failure,
      { format: selected.options.format },
      { formats: [selected.options.format] }
    ),
    error: detail
  };
  if (selected.options.format === "json") process.stdout.write(`${JSON.stringify(wire)}
`);
  else if (selected.options.format === "jsonl")
    process.stdout.write(`${JSON.stringify({ ...wire, seq: 0, kind: "result" })}
`);
  else process.stderr.write(`${detail.code}: ${detail.message}
`);
  process.exitCode = 1;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  reportFailure,
  resolveSelection
});
