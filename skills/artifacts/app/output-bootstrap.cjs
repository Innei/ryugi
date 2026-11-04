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
var define_BOOTSTRAP_OPTIONS_default = { format: { type: "string" }, json: { type: "boolean" }, detail: { type: "boolean" }, fields: { type: "string" }, quiet: { type: "boolean" }, verbose: { type: "boolean" }, "project-dir": { type: "string" }, artifact: { type: "string" }, host: { type: "string" }, "url-host": { type: "string" }, port: { type: "string" }, open: { type: "boolean" }, "no-open": { type: "boolean" }, foreground: { type: "boolean" }, background: { type: "boolean" }, visibility: { type: "string" }, type: { type: "string" }, project: { type: "boolean" }, limit: { type: "string" }, cursor: { type: "string" }, public: { type: "boolean" }, private: { type: "boolean" }, unpublish: { type: "boolean" }, list: { type: "boolean" }, delete: { type: "string" }, "with-boards": { type: "boolean" }, login: { type: "boolean" }, logout: { type: "boolean" }, section: { type: "string" }, snapshot: { type: "string" }, receipt: { type: "string" }, status: { type: "string" }, "waiting-on": { type: "string" }, kind: { type: "string" }, "choice-state": { type: "string" }, all: { type: "boolean" }, block: { type: "string" }, quote: { type: "string" }, board: { type: "string" }, x: { type: "string" }, y: { type: "string" }, thread: { type: "string" }, text: { type: "string" }, group: { type: "string" }, clear: { type: "boolean" }, ask: { type: "string" }, choice: { type: "string" }, round: { type: "string" }, withdraw: { type: "boolean" }, save: { type: "string" }, source: { type: "boolean" }, download: { type: "boolean" }, out: { type: "string" }, "no-comments": { type: "boolean" }, "output-format": { type: "string" }, "auto-publish": { type: "string" }, check: { type: "boolean" }, pm: { type: "string" } };

// src/cli/output/configuration.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// src/shared/cloud.ts
var MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

// src/shared/validate.ts
var BOARD_NUMBERS = ["x", "y", "w", "h"];
var BOARD_REQUIRED = ["file", "page", ...BOARD_NUMBERS];
var MEDIA_REQUIRED = ["src", "page", ...BOARD_NUMBERS];

// src/server/credentials.ts
var import_node_path = __toESM(require("node:path"), 1);
function credentialsFile(env, platform, home) {
  if (platform === "win32" && env.APPDATA)
    return import_node_path.default.join(env.APPDATA, "ryugi", "credentials.json");
  return import_node_path.default.join(env.XDG_CONFIG_HOME || import_node_path.default.join(home, ".config"), "ryugi", "credentials.json");
}

// src/server/settings.ts
var import_node_path2 = __toESM(require("node:path"), 1);
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
  project2 = projectRoot(project2);
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
  constructor(error, kind = "failed", raw) {
    super(error.message);
    this.error = error;
    this.kind = kind;
    this.raw = raw;
  }
  error;
  kind;
  raw;
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
    const keys = [.../* @__PURE__ */ new Set([...options.fields, ...policy.requiredFields ?? []])];
    if (policy.collection && data && typeof data === "object") {
      const record = data;
      const rows = record[policy.collection];
      data = {
        ...record,
        [policy.collection]: Array.isArray(rows) ? rows.map((row, i) => project(row, keys, `data.${policy.collection}.${i}`, omitted)) : rows
      };
    } else data = project(data, keys, "data", omitted);
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
    ...result2.completion.kind === "failed" ? { error: result2.completion.error } : result2.completion.kind === "interrupted" ? {
      error: {
        code: "E_INTERRUPTED",
        message: `Command interrupted by ${result2.completion.signal}.`,
        details: { signal: result2.completion.signal }
      }
    } : {}
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
  const configured = env.RYUGI_ARTIFACTS_FORMAT ?? "brief";
  const requested = values.format ?? (values.json ? "json" : values.quiet ? "quiet" : values.source ? "source" : configured);
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
  else if (!valid || !explicit.length && !["brief", "json", "jsonl"].includes(configured))
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
  return { options, ...error ? { error } : {} };
}

// src/cli/output/configuration.ts
var PERSISTED_FORMATS = ["brief", "json", "jsonl"];
function outputFiles(projectDir) {
  return {
    global: settingsFileFor(credentialsFile(process.env, process.platform, import_node_os2.default.homedir())),
    project: import_node_path4.default.join(import_node_path4.default.dirname(projectPaths(projectDir).root), "config.json")
  };
}
function read(file) {
  try {
    const raw = JSON.parse(import_node_fs2.default.readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Expected an object");
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
    if (output?.format !== void 0 && !PERSISTED_FORMATS.includes(output.format))
      throw new OutputError({
        code: "E_FORMAT_UNSUPPORTED",
        message: `Unsupported output format in ${file}: ${String(output.format)}`
      });
    return output && PERSISTED_FORMATS.includes(output.format) ? output.format : null;
  };
  const global = get(files.global), project2 = get(files.project);
  return {
    global,
    project: project2,
    effective: project2 ?? global ?? "brief",
    source: project2 ? "project" : global ? "global" : "default"
  };
}
function configuredEnvironment(argv, specs, env = process.env) {
  if (env.RYUGI_ARTIFACTS_FORMAT !== void 0) return env;
  const values = scanOptions(argv, specs);
  if (["format", "json", "quiet", "source"].some((key) => values[key] !== void 0)) return env;
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

// src/cli/output/view.ts
function recoveryActions(error, subject) {
  const details = error.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Object.entries(details).flatMap(
    ([key, url]) => typeof url === "string" && /^https?:\/\/\S+$/i.test(url) ? [{ kind: "url", label: subject ? `${subject} ${key}` : key, url }] : []
  );
}

// src/cli/output/render.ts
var clean = (text) => text.replaceAll(new RegExp("\\p{Cc}", "gu"), " ");
function clip(text, size = 160) {
  const segments = [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(text)];
  return segments.length > size ? `${segments.slice(0, size).map((s) => s.segment).join("")}\u2026` : text;
}
var scalar = (value) => value === null ? "none" : typeof value === "object" ? JSON.stringify(value) : String(value);
var quote = (value) => /^[\w./:@=+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
function actionText(action) {
  return action.kind === "command" ? action.argv.map(quote).join(" ") : action.url;
}
var effectLines = (effects) => effects.map(
  (effect) => `Effect: ${clean(effect.operation)} ${clean(effect.target)} \xB7 ${effect.state}`
);
function renderText(view, wire, options, collection, requiredFields = []) {
  const lines = [
    `${clean(view.heading)}: ${clean(view.status).toUpperCase()}${view.subject ? ` \xB7 ${clean(view.subject)}` : ""}`
  ];
  const omissions = [...wire.omitted ?? []];
  const selected = (key, required = false) => required || requiredFields.includes(key) || !options.fields || options.fields.includes(key);
  const value = (input, path5) => {
    const text = clean(scalar(input));
    const shown = options.detail ? text : clip(text);
    if (shown !== text) omissions.push({ path: path5, reason: "preview" });
    return shown;
  };
  const facts = (items) => {
    for (const item of items)
      if (collection || selected(item.binding.key, item.required))
        lines.push(
          `${clean(item.label)}: ${value(item.binding.value, `data.${item.binding.key}`)}`
        );
  };
  facts(view.facts);
  const errorActions = wire.error ? recoveryActions(wire.error) : [];
  if (wire.error) {
    lines.push(`${clean(wire.error.code)}: ${clean(wire.error.message)}`);
    if (wire.error.httpStatus !== void 0) lines.push(`HTTP: ${wire.error.httpStatus}`);
    const details = wire.error.details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      for (const [key, detail] of Object.entries(details)) {
        if (!errorActions.some((action) => action.label === key))
          facts([{ label: key, binding: { key, value: detail }, required: true }]);
      }
    } else if (details !== void 0)
      facts([{ label: "Details", binding: { key: "details", value: details }, required: true }]);
  }
  if (!collection && options.fields && wire.data && typeof wire.data === "object") {
    const bound = /* @__PURE__ */ new Set([
      ...view.facts.map((item) => item.binding.key),
      ...view.sections.flatMap(
        (section) => section.kind === "fields" ? section.facts.map((item) => item.binding.key) : [section.key]
      )
    ]);
    const data = wire.data;
    facts(
      [.../* @__PURE__ */ new Set([...options.fields, ...requiredFields])].filter((key) => !bound.has(key) && Object.hasOwn(data, key)).map((key) => ({ label: key, binding: { key, value: data[key] } }))
    );
  }
  for (const section of view.sections) {
    if (section.kind === "fields") {
      facts(section.facts);
      continue;
    }
    if (!collection && !selected(section.key)) continue;
    if (section.kind === "records") {
      if (section.title) lines.push(clean(section.title));
      const declared = new Set(section.columns.map((column) => column.key));
      const extra = section.key === collection ? [.../* @__PURE__ */ new Set([...options.fields ?? [], ...requiredFields])].filter((key) => !declared.has(key)).map((key) => ({ key, label: key })) : [];
      const columns = [...section.columns, ...extra].filter(
        (column) => section.key !== collection || selected(column.key, column.required)
      );
      const rows = section.rows.map(
        (row, i) => columns.map(
          (column) => value(
            row[column.key] === void 0 ? "" : row[column.key],
            `data.${section.key}.${i}.${column.key}`
          )
        )
      );
      if (options.format === "table") {
        const labels = columns.map((column) => column.label);
        const widths = labels.map(
          (label, i) => Math.max(label.length, ...rows.map((row) => row[i]?.length ?? 0))
        );
        lines.push(
          ...[labels, ...rows].map(
            (row) => row.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join("  ").trimEnd()
          )
        );
      } else
        for (const row of rows)
          lines.push(
            `  ${columns.flatMap((column, i) => {
              const cell = row[i];
              return cell === void 0 || cell === "" ? [] : [`${clean(column.label)}=${cell}`];
            }).join(" \xB7 ")}`
          );
      if (!rows.length) lines.push("No records.");
    } else if (section.kind === "diagnostics") {
      const limit = options.detail ? section.items.length : section.preview ?? 3;
      for (const item of section.items.slice(0, limit))
        lines.push(
          `  ${item.location ? `${clean(item.location)}  ` : ""}${clean(item.code)}: ${value(item.message, `data.${section.key}`)}`
        );
      if (limit < section.items.length)
        omissions.push({
          path: `data.${section.key}`,
          reason: "preview",
          count: section.items.length - limit
        });
    } else {
      if (section.title) lines.push(`${clean(section.title)}:`);
      lines.push(
        ...section.text.trimEnd().split("\n").map(
          (line) => `  ${line.replaceAll(new RegExp("\\p{Cc}", "gu"), (char) => char === "	" || char === "\n" ? char : "")}`
        )
      );
    }
  }
  if (wire.page)
    lines.push(
      `Scope: ${clean(wire.page.scope)} \xB7 ${wire.page.returned} shown${wire.page.total === null ? "" : ` / ${wire.page.total} matched`}${wire.page.hasMore ? " \xB7 more available" : ""}`
    );
  lines.push(...effectLines(wire.effects ?? []));
  for (const warning of wire.warnings ?? []) lines.push(`Warning: ${clean(warning.message)}`);
  if (omissions.length)
    lines.push(
      `Omitted: ${omissions.map((item) => `${item.count === void 0 ? "" : `${item.count} `}${item.path} (${item.reason})`).join(", ")}`
    );
  for (const action of [...view.actions ?? wire.next ?? [], ...errorActions])
    lines.push(`${clean(action.label ?? "Next")}: ${actionText(action)}`);
  return `${lines.join("\n")}
`;
}
function renderFailure(wire, options) {
  return renderText(
    { heading: wire.command, status: wire.outcome, facts: [], sections: [] },
    wire,
    {
      ...options,
      fields: void 0
    }
  );
}

// src/cli/output/bootstrap/index.ts
function resolveSelection(argv) {
  return selectOutput(argv, define_BOOTSTRAP_OPTIONS_default, configuredEnvironment(argv, define_BOOTSTRAP_OPTIONS_default));
}
function reportFailure(argv, error, selection) {
  let selected;
  try {
    selected = selection ?? resolveSelection(argv);
  } catch {
    selected = selectOutput(argv, define_BOOTSTRAP_OPTIONS_default);
  }
  const message = error instanceof Error ? error.message : String(error);
  const detail = selected.error?.error ?? (error instanceof OutputError ? error.error : { code: "E_BOOTSTRAP_FAILED", message });
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
  else process.stderr.write(renderFailure(wire, selected.options));
  process.exitCode = 1;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  reportFailure,
  resolveSelection
});
