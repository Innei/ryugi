"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/server/main.ts
var import_node_child_process = require("node:child_process");
var import_node_fs9 = __toESM(require("node:fs"), 1);
var import_node_path8 = __toESM(require("node:path"), 1);

// src/server/app.ts
var import_node_fs7 = __toESM(require("node:fs"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var import_node_path7 = __toESM(require("node:path"), 1);

// src/server/artifacts.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);

// src/shared/types.ts
var ARTIFACT_TYPES = ["artboard", "html"];

// src/shared/ids.ts
var ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
var isArtifactId = (id) => ID_PATTERN.test(id);
var isArtifactType = (type) => ARTIFACT_TYPES.includes(type);

// src/server/artifacts.ts
function subdirectories(dir) {
  try {
    return import_node_fs.default.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
function listArtifacts(root) {
  const artifacts = [];
  const warnings = [];
  for (const type of subdirectories(root)) {
    if (type.startsWith(".")) continue;
    if (!isArtifactType(type)) {
      warnings.push(`unknown artifact type directory: ${type}/ (known: ${ARTIFACT_TYPES.join(", ")})`);
      continue;
    }
    for (const id of subdirectories(import_node_path.default.join(root, type))) {
      if (isArtifactId(id)) artifacts.push({ type, id, dir: import_node_path.default.join(root, type, id) });
      else warnings.push(`invalid artifact id: ${type}/${id} (use lowercase letters, digits and hyphens)`);
    }
  }
  return { artifacts, warnings };
}
function resolveArtifactDir(root, type, id) {
  if (!isArtifactType(type) || !isArtifactId(id)) return null;
  const dir = import_node_path.default.join(root, type, id);
  try {
    return import_node_fs.default.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}
function artifactKeyOf(relative) {
  const [type, id] = relative.split("/");
  if (!type || !id || !isArtifactType(type) || !isArtifactId(id)) return null;
  return { type, id };
}
function artifactSignature(dir) {
  let count = 0;
  let size = 0;
  let latest = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = import_node_fs.default.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = import_node_path.default.join(current, entry.name);
      try {
        const stat = import_node_fs.default.statSync(full);
        count += 1;
        latest = Math.max(latest, stat.mtimeMs);
        if (entry.isDirectory()) walk(full);
        else size += stat.size;
      } catch {
        continue;
      }
    }
  };
  walk(dir);
  return `${count}:${size}:${latest}`;
}

// src/server/html.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
function latestMtime(dir) {
  let latest = 0;
  let entries;
  try {
    entries = import_node_fs2.default.readdirSync(dir, { withFileTypes: true });
  } catch {
    return latest;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = import_node_path2.default.join(dir, entry.name);
    try {
      latest = Math.max(latest, entry.isDirectory() ? latestMtime(full) : import_node_fs2.default.statSync(full).mtimeMs);
    } catch {
      continue;
    }
  }
  return latest;
}
function readHtml(dir, id) {
  let source;
  try {
    source = import_node_fs2.default.readFileSync(import_node_path2.default.join(dir, "index.html"), "utf8");
  } catch {
    return { title: id, warnings: ["index.html not found"], version: latestMtime(dir) };
  }
  const title = TITLE.exec(source)?.[1]?.trim();
  return { title: title || id, warnings: [], version: latestMtime(dir) };
}

// src/server/http.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};
var mimeOf = (file) => MIME[import_node_path3.default.extname(file).toLowerCase()] ?? "application/octet-stream";
var randomToken = () => import_node_crypto.default.randomBytes(24).toString("base64url");
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && import_node_crypto.default.timingSafeEqual(ab, bb);
}
function parseCookies(header) {
  const cookies = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}
function readPersisted(file) {
  try {
    return import_node_fs3.default.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}
function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
var urlHostForHttp = (host) => host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", ...headers });
  res.end(body);
}
function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { "Content-Type": MIME[".json"] });
}
function sendFile(res, file, headers = {}) {
  import_node_fs3.default.readFile(file, (err, data) => {
    if (err) send(res, 404, "Not found");
    else send(res, 200, data, { "Content-Type": mimeOf(file), ...headers });
  });
}

// src/server/paths.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
function resolveInside(root, relative) {
  const target = import_node_path4.default.resolve(root, `.${import_node_path4.default.sep}${relative}`);
  if (!target.startsWith(root + import_node_path4.default.sep)) return null;
  if (import_node_path4.default.relative(root, target).split(import_node_path4.default.sep).some((segment) => segment.startsWith("."))) return null;
  return target;
}
var isWithin = (child, parent) => child.toLowerCase().startsWith(`${parent.toLowerCase()}${import_node_path4.default.sep}`);
function resolveFileWithin(root, relative, allowedDir) {
  const target = resolveInside(root, relative);
  if (!target) return null;
  let real;
  let allowedReal;
  try {
    real = import_node_fs4.default.realpathSync(target);
    allowedReal = import_node_fs4.default.realpathSync(allowedDir);
  } catch {
    return null;
  }
  if (!isWithin(real, allowedReal)) return null;
  return import_node_fs4.default.statSync(real).isFile() ? real : null;
}
var resolveBoardFile = (boardDir, relative) => resolveFileWithin(boardDir, relative, import_node_path4.default.join(boardDir, "pages"));
var resolveHtmlFile = (artifactDir, relative) => resolveFileWithin(artifactDir, relative, artifactDir);

// src/server/state.ts
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);

// src/shared/geometry.ts
var GROUP_PAD = 48;
var GROUP_TOP = 144;
var NAME_STRIP_H = 32;
var TITLE_LINE_HEIGHT = 1.15;
var DEFAULT_TITLE_SIZE = 56;
var STICKY_DEFAULT_W = 240;
var STICKY_FONT_SIZE = 18;
var STICKY_LINE_H = 27;
var STICKY_PAD = 16;
var isWide = (code) => code >= 11904;
function textWidth(text, fontSize) {
  let width = 0;
  for (const char of text) width += fontSize * (isWide(char.codePointAt(0)) ? 1 : 0.56);
  return width;
}
function wrappedLines(text, fontSize, maxWidth) {
  return text.split("\n").reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(textWidth(paragraph, fontSize) / maxWidth)), 0);
}
function groupFrame(group, boards) {
  const members = group.boards.map((id) => boards[id]).filter((b) => Boolean(b));
  const first = members[0];
  if (!first) return null;
  const minX = Math.min(...members.map((b) => b.x));
  const minY = Math.min(...members.map((b) => b.y));
  const maxX = Math.max(...members.map((b) => b.x + b.w));
  const maxY = Math.max(...members.map((b) => b.y + b.h));
  return {
    page: first.page,
    x: minX - GROUP_PAD,
    y: minY - GROUP_TOP,
    w: maxX - minX + GROUP_PAD * 2,
    h: maxY - minY + GROUP_TOP + GROUP_PAD
  };
}
function noteRect(note) {
  if (note.kind === "sticky") {
    const w = note.w ?? STICKY_DEFAULT_W;
    const lines = wrappedLines(note.text, STICKY_FONT_SIZE, Math.max(1, w - STICKY_PAD * 2));
    return { x: note.x, y: note.y, w, h: lines * STICKY_LINE_H + STICKY_PAD * 2 };
  }
  const size = note.size ?? DEFAULT_TITLE_SIZE;
  const lineH = size * TITLE_LINE_HEIGHT;
  if (note.w === void 0) {
    return { x: note.x, y: note.y, w: textWidth(note.text, size), h: lineH };
  }
  return { x: note.x, y: note.y, w: note.w, h: wrappedLines(note.text, size, note.w) * lineH };
}
function extend(bounds, rect) {
  const next = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h };
  if (!bounds) return next;
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY)
  };
}
function computeLayout(canvas) {
  const pages = {};
  const pageOf = (id) => pages[id] ??= { groups: {}, notes: {}, bounds: null };
  for (const page of canvas.pages) pageOf(page.id);
  for (const board of Object.values(canvas.boards)) {
    const layout = pageOf(board.page);
    layout.bounds = extend(layout.bounds, { ...board, y: board.y - NAME_STRIP_H, h: board.h + NAME_STRIP_H });
  }
  for (const [id, group] of Object.entries(canvas.groups ?? {})) {
    const frame = groupFrame(group, canvas.boards);
    if (!frame) continue;
    const { page, ...rect } = frame;
    const layout = pageOf(page);
    layout.groups[id] = rect;
    layout.bounds = extend(layout.bounds, rect);
  }
  for (const [id, note] of Object.entries(canvas.notes ?? {})) {
    const rect = noteRect(note);
    const layout = pageOf(note.page);
    layout.notes[id] = rect;
    layout.bounds = extend(layout.bounds, rect);
  }
  return { pages };
}
var intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// src/shared/validate.ts
var BOARD_NUMBERS = ["x", "y", "w", "h"];
var BOARD_REQUIRED = ["file", "page", ...BOARD_NUMBERS];
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function structuralWarnings(raw) {
  if (!isObject(raw)) return ["canvas.json must be a JSON object"];
  const warnings = [];
  if (!Array.isArray(raw.pages)) warnings.push('"pages" must be an array');
  if (!isObject(raw.boards)) warnings.push('"boards" must be an object');
  if (raw.groups !== void 0 && !isObject(raw.groups)) warnings.push('"groups" must be an object');
  if (raw.notes !== void 0 && !isObject(raw.notes)) warnings.push('"notes" must be an object');
  if (raw.focus !== void 0 && (!isObject(raw.focus) || typeof raw.focus.target !== "string")) {
    warnings.push('"focus" must be { "target": <id>, "at": <time> }');
  }
  if (warnings.length > 0) return warnings;
  raw.pages.forEach((page, index) => {
    if (!isObject(page) || typeof page.id !== "string" || typeof page.name !== "string") {
      warnings.push(`pages[${index}] needs string "id" and "name"`);
    }
  });
  for (const [id, board] of Object.entries(raw.boards)) {
    if (!isObject(board)) {
      warnings.push(`board "${id}" must be an object`);
      continue;
    }
    for (const key of BOARD_REQUIRED) {
      if (board[key] === void 0) warnings.push(`board "${id}" is missing "${key}"`);
    }
    for (const key of BOARD_NUMBERS) {
      if (board[key] !== void 0 && typeof board[key] !== "number") {
        warnings.push(`board "${id}" field "${key}" must be a number`);
      }
    }
    for (const key of ["file", "page"]) {
      if (board[key] !== void 0 && typeof board[key] !== "string") {
        warnings.push(`board "${id}" field "${key}" must be a string`);
      }
    }
  }
  for (const [id, group] of Object.entries(raw.groups ?? {})) {
    if (!isObject(group) || !Array.isArray(group.boards) || group.boards.some((b) => typeof b !== "string")) {
      warnings.push(`group "${id}" needs a "boards" array`);
    }
  }
  for (const [id, note] of Object.entries(raw.notes ?? {})) {
    if (!isObject(note) || note.kind !== "title" && note.kind !== "sticky") {
      warnings.push(`note "${id}" needs "kind" "title" or "sticky"`);
    } else if (typeof note.x !== "number" || typeof note.y !== "number" || typeof note.text !== "string" || typeof note.page !== "string") {
      warnings.push(`note "${id}" needs numeric "x", "y" and string "text", "page"`);
    }
  }
  return warnings;
}
function validateCanvas(raw, fileExists) {
  const structural = structuralWarnings(raw);
  if (structural.length > 0) return structural;
  const canvas = raw;
  const warnings = [];
  const pages = new Set(canvas.pages.map((p) => p.id));
  const boards = Object.entries(canvas.boards);
  const groups = Object.entries(canvas.groups ?? {});
  const notes = Object.entries(canvas.notes ?? {});
  for (const [id, board] of boards) {
    if (!pages.has(board.page)) warnings.push(`board "${id}" uses unknown page "${board.page}"`);
    if (!board.file.startsWith("pages/")) warnings.push(`board "${id}" file must start with "pages/": ${board.file}`);
    else if (!fileExists(board.file)) warnings.push(`board "${id}" file not found: ${board.file}`);
  }
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const [ia, a] = boards[i];
      const [ib, b] = boards[j];
      if (a.page === b.page && intersects(a, b)) warnings.push(`boards "${ia}" and "${ib}" overlap`);
    }
  }
  const frames = [];
  for (const [id, group] of groups) {
    for (const member of group.boards) {
      if (!canvas.boards[member]) warnings.push(`group "${id}" references unknown board "${member}"`);
    }
    const memberPages = new Set(group.boards.map((m) => canvas.boards[m]?.page).filter(Boolean));
    if (memberPages.size > 1) warnings.push(`group "${id}" spans several pages`);
    else frames.push([id, groupFrame(group, canvas.boards)]);
  }
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const [ia, a] = frames[i];
      const [ib, b] = frames[j];
      if (a && b && a.page === b.page && intersects(a, b)) warnings.push(`groups "${ia}" and "${ib}" overlap`);
    }
  }
  for (const [id, note] of notes) {
    if (!pages.has(note.page)) {
      warnings.push(`note "${id}" uses unknown page "${note.page}"`);
      continue;
    }
    const rect = noteRect(note);
    if (note.kind === "title") {
      for (const [gid, frame] of frames) {
        if (frame && frame.page === note.page && intersects(rect, frame)) {
          warnings.push(`title "${id}" overlaps group "${gid}"`);
        }
      }
    } else {
      for (const [bid, board] of boards) {
        if (board.page === note.page && intersects(rect, board)) warnings.push(`sticky "${id}" covers board "${bid}"`);
      }
    }
  }
  if (canvas.activePage !== void 0 && !pages.has(canvas.activePage)) {
    warnings.push(`activePage "${canvas.activePage}" is not a page`);
  }
  const target = canvas.focus?.target;
  if (target !== void 0 && !canvas.boards[target] && !canvas.groups?.[target] && !canvas.notes?.[target]) {
    warnings.push(`focus target "${target}" is not a board, group or note`);
  }
  return warnings;
}

// src/server/state.ts
function readRaw(boardDir) {
  let text;
  try {
    text = import_node_fs5.default.readFileSync(import_node_path5.default.join(boardDir, "canvas.json"), "utf8");
  } catch {
    return { warning: "canvas.json not found" };
  }
  try {
    return { raw: JSON.parse(text) };
  } catch (err) {
    return { warning: `canvas.json is not valid JSON: ${err.message}` };
  }
}
function boardVersions(boardDir, canvas) {
  const versions = {};
  for (const board of Object.values(canvas.boards)) {
    const target = resolveBoardFile(boardDir, board.file);
    if (!target) continue;
    try {
      versions[board.file] = import_node_fs5.default.statSync(target).mtimeMs;
    } catch {
      versions[board.file] = 0;
    }
  }
  return versions;
}
function readCanvas(boardDir) {
  const { raw, warning } = readRaw(boardDir);
  if (warning) return { canvas: null, warnings: [warning], layout: null, versions: {} };
  try {
    const structural = structuralWarnings(raw);
    if (structural.length > 0) return { canvas: null, warnings: structural, layout: null, versions: {} };
    const canvas = raw;
    const warnings = validateCanvas(canvas, (rel) => resolveBoardFile(boardDir, rel) !== null);
    return { canvas, warnings, layout: computeLayout(canvas), versions: boardVersions(boardDir, canvas) };
  } catch (err) {
    return {
      canvas: null,
      warnings: [`canvas.json could not be checked: ${err.message}`],
      layout: null,
      versions: {}
    };
  }
}
function writeJsonAtomic(file, value) {
  import_node_fs5.default.mkdirSync(import_node_path5.default.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  import_node_fs5.default.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}
`, { mode: 384 });
  import_node_fs5.default.renameSync(tmp, file);
}
function writeArtifactState(stateDir, ref, payload) {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const dir = import_node_path5.default.join(stateDir, ref.type, ref.id);
  if (ref.type === "artboard") {
    writeJsonAtomic(import_node_path5.default.join(dir, "layout.json"), { checkedAt, ...payload.layout ?? { pages: {} } });
  }
  writeJsonAtomic(import_node_path5.default.join(dir, "warnings.json"), { checkedAt, warnings: payload.warnings });
}

// src/server/watch.ts
var import_node_fs6 = __toESM(require("node:fs"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var toPosix = (file) => file.split(import_node_path6.default.sep).join("/");
var ignored = (file) => file === ".state" || file.startsWith(".state/");
function snapshot(root, dir = root, out = /* @__PURE__ */ new Map()) {
  let entries;
  try {
    entries = import_node_fs6.default.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = import_node_path6.default.join(dir, entry.name);
    const rel = toPosix(import_node_path6.default.relative(root, full));
    if (ignored(rel)) continue;
    if (entry.isDirectory()) snapshot(root, full, out);
    else {
      try {
        out.set(rel, import_node_fs6.default.statSync(full).mtimeMs);
      } catch {
      }
    }
  }
  return out;
}
function pollTree(root, onChange, intervalMs = 400) {
  let previous = snapshot(root);
  const timer = setInterval(() => {
    const current = snapshot(root);
    const changed = [];
    for (const [file, mtime] of current) if (previous.get(file) !== mtime) changed.push(file);
    for (const file of previous.keys()) if (!current.has(file)) changed.push(file);
    previous = current;
    if (changed.length > 0) onChange(changed);
  }, intervalMs);
  return { close: () => clearInterval(timer) };
}
function watchTree(root, onChange, debounceMs = 120, backupPollMs = 1e3) {
  let pending = /* @__PURE__ */ new Set();
  let timer;
  const queue = (files) => {
    for (const file of files) if (!ignored(file)) pending.add(file);
    if (pending.size === 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const files2 = [...pending];
      pending = /* @__PURE__ */ new Set();
      onChange(files2);
    }, debounceMs);
  };
  try {
    const watcher = import_node_fs6.default.watch(root, { recursive: true }, (_event, filename) => {
      if (filename) queue([toPosix(filename.toString())]);
    });
    watcher.on("error", () => {
    });
    const backup = pollTree(root, queue, backupPollMs);
    return {
      close: () => {
        clearTimeout(timer);
        watcher.close();
        backup.close();
      }
    };
  } catch {
    const poller = pollTree(root, queue);
    return {
      close: () => {
        clearTimeout(timer);
        poller.close();
      }
    };
  }
}

// src/server/ws.ts
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var OPCODE_TEXT = 1;
var OPCODE_CLOSE = 8;
var OPCODE_PING = 9;
var OPCODE_PONG = 10;
function acceptKey(clientKey) {
  return import_node_crypto2.default.createHash("sha1").update(clientKey + WS_MAGIC).digest("base64");
}
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([128 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 128 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}
var textFrame = (text) => encodeFrame(OPCODE_TEXT, Buffer.from(text));
function completeHandshake(socket, clientKey) {
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${acceptKey(clientKey)}\r
\r
`
  );
}
function rejectUpgrade(socket, status, reason) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r
Connection: close\r
Content-Length: 0\r
\r
`);
}
function handleClientFrames(socket) {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 15;
      let len = buffer[1] & 127;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        socket.destroy();
        return;
      }
      const total = offset + 4 + len;
      if (buffer.length < total) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, total));
      for (let i = 0; i < payload.length; i++) payload[i] = payload[i] ^ mask[i % 4];
      buffer = buffer.subarray(total);
      if (opcode === OPCODE_CLOSE) {
        socket.end(encodeFrame(OPCODE_CLOSE, Buffer.alloc(0)));
        return;
      }
      if (opcode === OPCODE_PING) socket.write(encodeFrame(OPCODE_PONG, payload));
    }
  });
}

// src/server/app.ts
var VIEWER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join("; ");
var CONTENT_CSP = {
  artboard: "sandbox allow-scripts",
  html: "sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads"
};
var SHELL_ROUTE = /^\/(?:(artboard|html)\/([^/]+)\/?)?$/;
var API_ARTIFACT_ROUTE = /^\/api\/artifacts\/([^/]+)\/([^/]+)$/;
function readArtifact(dir, ref) {
  return ref.type === "artboard" ? readCanvas(dir) : readHtml(dir, ref.id);
}
function titleOf(payload, ref) {
  if ("title" in payload) return payload.title;
  return payload.canvas?.title || ref.id;
}
async function startArtifactsServer(options) {
  const root = import_node_path7.default.resolve(options.root);
  const viewerDir = import_node_path7.default.resolve(options.viewerDir);
  const stateDir = import_node_path7.default.join(root, ".state");
  import_node_fs7.default.mkdirSync(stateDir, { recursive: true, mode: 448 });
  import_node_fs7.default.writeFileSync(import_node_path7.default.join(stateDir, ".gitignore"), "*\n");
  const portFile = import_node_path7.default.join(stateDir, ".last-port");
  const tokenFile = import_node_path7.default.join(stateDir, ".last-token");
  const token = readPersisted(tokenFile) || randomToken();
  import_node_fs7.default.writeFileSync(tokenFile, `${token}
`, { mode: 384 });
  const contentToken = randomToken();
  const contentPrefix = `/c/${contentToken}/`;
  const clients = /* @__PURE__ */ new Set();
  const changeListeners = [];
  const activityListeners = [];
  const touch = () => activityListeners.forEach((listener) => listener());
  let port = 0;
  let cookieName = "";
  const isAuthorized = (req, keyFromQuery) => keyFromQuery !== null && safeEqual(keyFromQuery, token) || safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? "", token);
  const serveContent = (res, rest) => {
    const [type = "", id = "", ...parts] = rest.split("/");
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      send(res, 404, "Not found");
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`);
    const relative = parts.join("/");
    if (!resolveInside(dir, relative)) {
      send(res, 403, "Forbidden");
      return;
    }
    const target = ref.type === "artboard" ? resolveBoardFile(dir, relative) : resolveHtmlFile(dir, relative);
    if (!target) send(res, 404, "Not found");
    else sendFile(res, target, { "Content-Security-Policy": CONTENT_CSP[ref.type] });
  };
  const serveArtifactApi = (res, type, id) => {
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      sendJson(res, 404, { warnings: [`artifact ${type}/${id} not found`] });
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`);
    sendJson(res, 200, { ...readArtifact(dir, ref), contentBase: `${contentPrefix}${type}/${id}/` });
  };
  const serveList = (res) => {
    const { artifacts, warnings } = listArtifacts(root);
    const summaries = artifacts.map((entry) => ({
      type: entry.type,
      id: entry.id,
      title: titleOf(readArtifact(entry.dir, entry), entry)
    }));
    sendJson(res, 200, { artifacts: summaries, warnings });
  };
  const handleRequest = (req, res) => {
    touch();
    const url2 = new URL(req.url ?? "/", "http://artifacts.local");
    let pathname;
    try {
      pathname = decodeURIComponent(url2.pathname);
    } catch {
      send(res, 400, "Bad request");
      return;
    }
    if (pathname.startsWith("/c/")) {
      if (!pathname.startsWith(contentPrefix)) send(res, 404, "Not found");
      else serveContent(res, pathname.slice(contentPrefix.length));
      return;
    }
    const key = url2.searchParams.get("key");
    if (!isAuthorized(req, key)) {
      send(res, 403, "Forbidden: open the full artifact link including ?key=");
      return;
    }
    if (pathname === "/api/artifacts") {
      serveList(res);
      return;
    }
    const apiMatch = API_ARTIFACT_ROUTE.exec(pathname);
    if (apiMatch) {
      serveArtifactApi(res, apiMatch[1], apiMatch[2]);
      return;
    }
    if (SHELL_ROUTE.test(pathname) || pathname === "/index.html") {
      const headers = { "Content-Security-Policy": VIEWER_CSP };
      if (key !== null) headers["Set-Cookie"] = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
      sendFile(res, import_node_path7.default.join(viewerDir, "index.html"), headers);
      return;
    }
    const target = resolveInside(viewerDir, pathname.slice(1));
    if (!target) send(res, 404, "Not found");
    else sendFile(res, target, { "Content-Security-Policy": VIEWER_CSP });
  };
  const server = import_node_http.default.createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, `Artifacts error: ${err.message}`);
    }
  });
  server.on("upgrade", (req, socket) => {
    const url2 = new URL(req.url ?? "/", "http://artifacts.local");
    const clientKey = req.headers["sec-websocket-key"];
    if (url2.pathname !== "/ws" || typeof clientKey !== "string") {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    const origin2 = req.headers.origin;
    const host = req.headers.host ?? "";
    const sameHost = origin2 === `http://${host}` || origin2 === `https://${host}`;
    if (!isAuthorized(req, url2.searchParams.get("key")) || !sameHost) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    completeHandshake(socket, clientKey);
    clients.add(socket);
    handleClientFrames(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    touch();
  });
  const previousPort = Number(readPersisted(portFile));
  try {
    port = await listen(server, options.host, Number.isInteger(previousPort) && previousPort > 0 ? previousPort : 0);
  } catch {
    port = await listen(server, options.host, 0);
  }
  cookieName = `ryugi_artifacts_${port}`;
  import_node_fs7.default.writeFileSync(portFile, `${port}
`, { mode: 384 });
  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  const url = `${origin}/?key=${token}`;
  const linkFor = (type, id) => `${origin}/${type}/${id}?key=${token}`;
  const signatures = /* @__PURE__ */ new Map();
  const refreshState = (ref, dir) => {
    signatures.set(`${ref.type}/${ref.id}`, artifactSignature(dir));
    const payload = readArtifact(dir, ref);
    try {
      writeArtifactState(stateDir, ref, payload);
    } catch (err) {
      console.error(JSON.stringify({ type: "state-write-error", error: err.message }));
    }
    return payload;
  };
  for (const entry of listArtifacts(root).artifacts) refreshState(entry, entry.dir);
  writeJsonAtomic(import_node_path7.default.join(stateDir, "server-info"), { type: "server-started", url, port, root });
  const watcher = watchTree(
    root,
    (files) => {
      const byArtifact = /* @__PURE__ */ new Map();
      for (const file of files) {
        const ref = artifactKeyOf(file);
        if (!ref) continue;
        const key = `${ref.type}/${ref.id}`;
        const entry = byArtifact.get(key) ?? { ref, files: [] };
        const inner = file.slice(key.length + 1);
        if (inner) entry.files.push(inner);
        byArtifact.set(key, entry);
      }
      for (const [key, { ref, files: changed }] of byArtifact) {
        const dir = resolveArtifactDir(root, ref.type, ref.id);
        if (!dir) {
          signatures.delete(key);
          continue;
        }
        if (signatures.get(key) === artifactSignature(dir)) continue;
        const payload = refreshState(ref, dir);
        const frame = textFrame(JSON.stringify({ type: "change", artifact: key, files: changed }));
        for (const socket of clients) socket.write(frame);
        changeListeners.forEach((listener) => listener(ref, payload, changed));
      }
      touch();
    },
    options.debounceMs
  );
  return {
    port,
    token,
    contentToken,
    url,
    linkFor,
    clientCount: () => clients.size,
    onArtifactChange: (listener) => changeListeners.push(listener),
    onActivity: (listener) => activityListeners.push(listener),
    close: () => new Promise((resolve) => {
      watcher.close();
      for (const socket of clients) socket.destroy();
      server.close(() => resolve());
      server.closeAllConnections();
    })
  };
}

// src/server/lifecycle.ts
var import_node_fs8 = __toESM(require("node:fs"), 1);
var DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1e3;
var DEFAULT_LIFECYCLE_CHECK_MS = 60 * 1e3;
var SERVER_ID_ARG = "--artifacts-server-id=";
var positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
var isLoopback = (host) => host === "127.0.0.1" || host === "localhost" || host === "::1";
function parseEnv(env, argv = []) {
  const root = env.ARTIFACTS_ROOT;
  if (!root) throw new Error("ARTIFACTS_ROOT is required");
  const host = env.ARTIFACTS_HOST || "127.0.0.1";
  const urlHost = env.ARTIFACTS_URL_HOST || (isLoopback(host) ? "localhost" : host);
  const serverIdArg = argv.find((arg) => arg.startsWith(SERVER_ID_ARG));
  return {
    root,
    host,
    urlHost,
    idleTimeoutMs: positive(env.ARTIFACTS_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
    lifecycleCheckMs: positive(env.ARTIFACTS_LIFECYCLE_CHECK_MS, DEFAULT_LIFECYCLE_CHECK_MS),
    open: env.ARTIFACTS_OPEN === "1",
    openCmd: env.ARTIFACTS_OPEN_CMD || null,
    serverId: serverIdArg ? serverIdArg.slice(SERVER_ID_ARG.length) : null
  };
}
function readOwners(file) {
  let text;
  try {
    text = import_node_fs8.default.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const pids = text.split("\n").map((line) => Number(line.trim())).filter((pid) => Number.isInteger(pid) && pid > 1);
  return [...new Set(pids)];
}
var liveOwners = (pids, alive) => pids.filter(alive);
function browserLauncher(platform, url) {
  if (platform === "darwin") return { bin: "open", args: [url] };
  if (platform === "win32") return { bin: "cmd", args: ["/c", "start", '""', url] };
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") return { bin: "xdg-open", args: [url] };
  return null;
}
function shutdownReason(state) {
  if (!state.ownersAlive) return "all owner processes exited";
  if (state.now - state.lastActivity > state.idleTimeoutMs) return "idle timeout";
  return null;
}
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// src/server/main.ts
async function main() {
  const config = parseEnv(process.env, process.argv.slice(2));
  const root = import_node_path8.default.resolve(config.root);
  const stateDir = import_node_path8.default.join(root, ".state");
  const server = await startArtifactsServer({
    root,
    viewerDir: import_node_path8.default.join(__dirname, "viewer"),
    host: config.host,
    urlHost: config.urlHost
  });
  let lastActivity = Date.now();
  server.onActivity(() => {
    lastActivity = Date.now();
  });
  let browserOpened = false;
  server.onArtifactChange((ref, payload) => {
    if (browserOpened || !config.open || !isLoopback(config.host)) return;
    if ("canvas" in payload && (!payload.canvas || Object.keys(payload.canvas.boards ?? {}).length === 0)) return;
    if ("title" in payload && payload.warnings.length > 0) return;
    browserOpened = true;
    if (server.clientCount() > 0) return;
    const link = server.linkFor(ref.type, ref.id);
    if (config.openCmd) {
      (0, import_node_child_process.exec)(`${config.openCmd} ${JSON.stringify(link)}`, () => {
      });
      return;
    }
    const launcher = browserLauncher(process.platform, link);
    if (launcher) (0, import_node_child_process.execFile)(launcher.bin, launcher.args, () => {
    });
  });
  const shutdown = async (reason) => {
    console.log(JSON.stringify({ type: "server-stopped", reason }));
    import_node_fs9.default.rmSync(import_node_path8.default.join(stateDir, "server-info"), { force: true });
    writeJsonAtomic(import_node_path8.default.join(stateDir, "server-stopped"), { reason, timestamp: Date.now() });
    await server.close();
    process.exit(0);
  };
  const ownersFile = import_node_path8.default.join(stateDir, "owners");
  const timer = setInterval(() => {
    const owners = readOwners(ownersFile);
    const reason = shutdownReason({
      now: Date.now(),
      lastActivity,
      idleTimeoutMs: config.idleTimeoutMs,
      ownersAlive: owners.length === 0 || liveOwners(owners, processAlive).length > 0
    });
    if (reason) void shutdown(reason);
  }, config.lifecycleCheckMs);
  timer.unref();
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  import_node_fs9.default.rmSync(import_node_path8.default.join(stateDir, "server-stopped"), { force: true });
  console.log(JSON.stringify({ type: "server-started", url: server.url, port: server.port, root }));
}
main().catch((err) => {
  console.log(JSON.stringify({ type: "server-error", error: err.message }));
  process.exit(1);
});
