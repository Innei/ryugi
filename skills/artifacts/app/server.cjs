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
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);

// src/server/app.ts
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// src/server/paths.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function resolveInside(root, relative) {
  const target = import_node_path.default.resolve(root, `.${import_node_path.default.sep}${relative}`);
  if (!target.startsWith(root + import_node_path.default.sep)) return null;
  const first = import_node_path.default.relative(root, target).split(import_node_path.default.sep)[0];
  if (first?.toLowerCase() === "state") return null;
  return target;
}
var isWithin = (child, parent) => child.toLowerCase().startsWith(`${parent.toLowerCase()}${import_node_path.default.sep}`);
function resolveBoardFile(boardDir, relative) {
  const target = resolveInside(boardDir, relative);
  if (!target) return null;
  let real;
  let pagesReal;
  try {
    real = import_node_fs.default.realpathSync(target);
    pagesReal = import_node_fs.default.realpathSync(import_node_path.default.join(boardDir, "pages"));
  } catch {
    return null;
  }
  if (!isWithin(real, pagesReal)) return null;
  return import_node_fs.default.statSync(real).isFile() ? real : null;
}

// src/server/state.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);

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
    text = import_node_fs2.default.readFileSync(import_node_path2.default.join(boardDir, "canvas.json"), "utf8");
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
      versions[board.file] = import_node_fs2.default.statSync(target).mtimeMs;
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
  import_node_fs2.default.mkdirSync(import_node_path2.default.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  import_node_fs2.default.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}
`, { mode: 384 });
  import_node_fs2.default.renameSync(tmp, file);
}
function writeStateFiles(boardDir, payload) {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const stateDir = import_node_path2.default.join(boardDir, "state");
  writeJsonAtomic(import_node_path2.default.join(stateDir, "layout.json"), { checkedAt, ...payload.layout ?? { pages: {} } });
  writeJsonAtomic(import_node_path2.default.join(stateDir, "warnings.json"), { checkedAt, warnings: payload.warnings });
}

// src/server/watch.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var toPosix = (file) => file.split(import_node_path3.default.sep).join("/");
var ignored = (file) => file === "state" || file.startsWith("state/");
function snapshot(root, dir = root, out = /* @__PURE__ */ new Map()) {
  let entries;
  try {
    entries = import_node_fs3.default.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = import_node_path3.default.join(dir, entry.name);
    const rel = toPosix(import_node_path3.default.relative(root, full));
    if (ignored(rel)) continue;
    if (entry.isDirectory()) snapshot(root, full, out);
    else {
      try {
        out.set(rel, import_node_fs3.default.statSync(full).mtimeMs);
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
function watchTree(root, onChange, debounceMs = 120) {
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
    const watcher = import_node_fs3.default.watch(root, { recursive: true }, (_event, filename) => {
      if (filename) queue([toPosix(filename.toString())]);
    });
    watcher.on("error", () => {
    });
    return {
      close: () => {
        clearTimeout(timer);
        watcher.close();
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
var import_node_crypto = __toESM(require("node:crypto"), 1);
var WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var OPCODE_TEXT = 1;
var OPCODE_CLOSE = 8;
var OPCODE_PING = 9;
var OPCODE_PONG = 10;
function acceptKey(clientKey) {
  return import_node_crypto.default.createHash("sha1").update(clientKey + WS_MAGIC).digest("base64");
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
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
var BOARD_CSP = "sandbox allow-scripts";
var randomToken = () => import_node_crypto2.default.randomBytes(24).toString("base64url");
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && import_node_crypto2.default.timingSafeEqual(ab, bb);
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
    return import_node_fs4.default.readFileSync(file, "utf8").trim();
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
async function startArtboardServer(options) {
  const boardDir = import_node_path4.default.resolve(options.boardDir);
  const viewerDir = import_node_path4.default.resolve(options.viewerDir);
  const stateDir = import_node_path4.default.join(boardDir, "state");
  import_node_fs4.default.mkdirSync(stateDir, { recursive: true, mode: 448 });
  const portFile = import_node_path4.default.join(stateDir, ".last-port");
  const tokenFile = import_node_path4.default.join(stateDir, ".last-token");
  const token = readPersisted(tokenFile) || randomToken();
  import_node_fs4.default.writeFileSync(tokenFile, `${token}
`, { mode: 384 });
  const boardToken = randomToken();
  const clients = /* @__PURE__ */ new Set();
  const changeListeners = [];
  const activityListeners = [];
  const touch = () => activityListeners.forEach((listener) => listener());
  let port = 0;
  let cookieName = "";
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", ...headers });
    res.end(body);
  };
  const sendFile = (res, file, headers = {}) => {
    import_node_fs4.default.readFile(file, (err, data) => {
      if (err) send(res, 404, "Not found");
      else send(res, 200, data, { "Content-Type": MIME[import_node_path4.default.extname(file).toLowerCase()] ?? "application/octet-stream", ...headers });
    });
  };
  const isAuthorized = (req, keyFromQuery) => keyFromQuery !== null && safeEqual(keyFromQuery, token) || safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? "", token);
  const handleRequest = (req, res) => {
    touch();
    const url2 = new URL(req.url ?? "/", "http://artboard.local");
    let pathname;
    try {
      pathname = decodeURIComponent(url2.pathname);
    } catch {
      send(res, 400, "Bad request");
      return;
    }
    const boardPrefix = "/b/";
    if (pathname.startsWith(boardPrefix)) {
      const rest = pathname.slice(boardPrefix.length);
      const slash = rest.indexOf("/");
      const given = slash < 0 ? rest : rest.slice(0, slash);
      if (!safeEqual(given, boardToken)) {
        send(res, 404, "Not found");
        return;
      }
      const relative = rest.slice(slash + 1);
      if (!resolveInside(boardDir, relative)) {
        send(res, 403, "Forbidden");
        return;
      }
      const target2 = resolveBoardFile(boardDir, relative);
      if (!target2) send(res, 404, "Not found");
      else sendFile(res, target2, { "Content-Security-Policy": BOARD_CSP });
      return;
    }
    const key = url2.searchParams.get("key");
    if (!isAuthorized(req, key)) {
      send(res, 403, "Forbidden: open the full Artboard URL including ?key=");
      return;
    }
    if (pathname === "/api/canvas") {
      const payload = { ...readCanvas(boardDir), boardBase: `${boardPrefix}${boardToken}/` };
      send(res, 200, JSON.stringify(payload), { "Content-Type": MIME[".json"] });
      return;
    }
    if (pathname === "/" || pathname === "/index.html") {
      const headers = { "Content-Security-Policy": VIEWER_CSP };
      if (key !== null) headers["Set-Cookie"] = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
      sendFile(res, import_node_path4.default.join(viewerDir, "index.html"), headers);
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
      if (!res.headersSent) send(res, 500, `Artboard error: ${err.message}`);
    }
  });
  server.on("upgrade", (req, socket) => {
    const url2 = new URL(req.url ?? "/", "http://artboard.local");
    const clientKey = req.headers["sec-websocket-key"];
    if (url2.pathname !== "/ws" || typeof clientKey !== "string") {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    const origin = req.headers.origin;
    const host = req.headers.host ?? "";
    const sameHost = origin === `http://${host}` || origin === `https://${host}`;
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
  cookieName = `artboard_${port}`;
  import_node_fs4.default.writeFileSync(portFile, `${port}
`, { mode: 384 });
  const url = `http://${urlHostForHttp(options.urlHost)}:${port}/?key=${token}`;
  writeStateFiles(boardDir, readCanvas(boardDir));
  writeJsonAtomic(import_node_path4.default.join(stateDir, "server-info"), { type: "server-started", url, port, dir: boardDir });
  const watcher = watchTree(
    boardDir,
    (files) => {
      const payload = readCanvas(boardDir);
      try {
        writeStateFiles(boardDir, payload);
      } catch (err) {
        console.error(JSON.stringify({ type: "state-write-error", error: err.message }));
      }
      const frame = textFrame(JSON.stringify({ type: "change", files }));
      for (const socket of clients) socket.write(frame);
      touch();
      changeListeners.forEach((listener) => listener(payload, files));
    },
    options.debounceMs
  );
  return {
    port,
    token,
    boardToken,
    url,
    clientCount: () => clients.size,
    onBoardChange: (listener) => changeListeners.push(listener),
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
var DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1e3;
var DEFAULT_LIFECYCLE_CHECK_MS = 60 * 1e3;
var positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
var isLoopback = (host) => host === "127.0.0.1" || host === "localhost" || host === "::1";
function parseEnv(env, argv = []) {
  const boardDir = env.ARTBOARD_DIR;
  if (!boardDir) throw new Error("ARTBOARD_DIR is required");
  const host = env.ARTBOARD_HOST || "127.0.0.1";
  const urlHost = env.ARTBOARD_URL_HOST || (isLoopback(host) ? "localhost" : host);
  const ownerPid = Number(env.ARTBOARD_OWNER_PID);
  const serverIdArg = argv.find((arg) => arg.startsWith("--artboard-server-id="));
  return {
    boardDir,
    host,
    urlHost,
    ownerPid: Number.isInteger(ownerPid) && ownerPid > 1 ? ownerPid : null,
    idleTimeoutMs: positive(env.ARTBOARD_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
    lifecycleCheckMs: positive(env.ARTBOARD_LIFECYCLE_CHECK_MS, DEFAULT_LIFECYCLE_CHECK_MS),
    open: env.ARTBOARD_OPEN === "1",
    openCmd: env.ARTBOARD_OPEN_CMD || null,
    serverId: serverIdArg ? serverIdArg.slice("--artboard-server-id=".length) : null
  };
}
function browserLauncher(platform, url) {
  if (platform === "darwin") return { bin: "open", args: [url] };
  if (platform === "win32") return { bin: "cmd", args: ["/c", "start", '""', url] };
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") return { bin: "xdg-open", args: [url] };
  return null;
}
function shutdownReason(state) {
  if (!state.ownerAlive) return "owner process exited";
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
  const boardDir = import_node_path5.default.resolve(config.boardDir);
  const stateDir = import_node_path5.default.join(boardDir, "state");
  const server = await startArtboardServer({
    boardDir,
    viewerDir: import_node_path5.default.join(__dirname, "viewer"),
    host: config.host,
    urlHost: config.urlHost
  });
  let lastActivity = Date.now();
  server.onActivity(() => {
    lastActivity = Date.now();
  });
  let browserOpened = false;
  server.onBoardChange((payload) => {
    if (browserOpened || !config.open || !isLoopback(config.host)) return;
    if (!payload.canvas || Object.keys(payload.canvas.boards ?? {}).length === 0) return;
    browserOpened = true;
    if (server.clientCount() > 0) return;
    if (config.openCmd) {
      (0, import_node_child_process.exec)(`${config.openCmd} ${JSON.stringify(server.url)}`, () => {
      });
      return;
    }
    const launcher = browserLauncher(process.platform, server.url);
    if (launcher) (0, import_node_child_process.execFile)(launcher.bin, launcher.args, () => {
    });
  });
  const shutdown = async (reason) => {
    console.log(JSON.stringify({ type: "server-stopped", reason }));
    import_node_fs5.default.rmSync(import_node_path5.default.join(stateDir, "server-info"), { force: true });
    writeJsonAtomic(import_node_path5.default.join(stateDir, "server-stopped"), { reason, timestamp: Date.now() });
    await server.close();
    process.exit(0);
  };
  const timer = setInterval(() => {
    const reason = shutdownReason({
      now: Date.now(),
      lastActivity,
      idleTimeoutMs: config.idleTimeoutMs,
      ownerAlive: config.ownerPid === null || processAlive(config.ownerPid)
    });
    if (reason) void shutdown(reason);
  }, config.lifecycleCheckMs);
  timer.unref();
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  import_node_fs5.default.rmSync(import_node_path5.default.join(stateDir, "server-stopped"), { force: true });
  console.log(JSON.stringify({ type: "server-started", url: server.url, port: server.port, dir: boardDir }));
}
main().catch((err) => {
  console.log(JSON.stringify({ type: "server-error", error: err.message }));
  process.exit(1);
});
