// Generated from ryugi-cloud/packages/artifacts/src/shared/review-evidence.ts. Do not edit.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/review-evidence.ts
var review_evidence_exports = {};
__export(review_evidence_exports, {
  humanTokens: () => humanTokens,
  reviewStateKey: () => reviewStateKey,
  unreadThreadCount: () => unreadThreadCount
});
module.exports = __toCommonJS(review_evidence_exports);
var import_node_crypto = require("node:crypto");
var hash = (value) => (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
var reviewStateKey = (artifact, agent) => hash([artifact, agent]);
function humanTokens(thread) {
  const values = thread.messages.filter((message) => message.author === "human").map((message) => ({
    token: hash([thread.id, "message", message.id, message.at, message.editedAt, message.deleted, message.text]),
    at: message.editedAt ?? message.at
  }));
  if (thread.statusBy === "human")
    values.push({ token: hash([thread.id, "status", thread.statusAt, thread.status]), at: thread.statusAt });
  return values;
}
function unreadThreadCount(file, consumed = []) {
  const seen = new Set(consumed);
  return (file?.threads ?? []).filter((thread) => {
    const anchor = thread.anchor;
    return anchor.ask === void 0 && anchor.choice === void 0 && anchor.submit === void 0 && humanTokens(thread).some((event) => !seen.has(event.token));
  }).length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  humanTokens,
  reviewStateKey,
  unreadThreadCount
});
