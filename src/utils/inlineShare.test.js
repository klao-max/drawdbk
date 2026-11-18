import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeInlineShare,
  encodeInlineShare,
  getInlineSharePayload,
} from "./inlineShare.js";

test("inline share data round-trips compressed diagram JSON", async () => {
  const source = JSON.stringify({ title: "TaskAll", tables: ["users"] });
  const payload = await encodeInlineShare(source);

  assert.match(payload, /^(gz|raw)\./);
  assert.equal(await decodeInlineShare(payload), source);
});

test("inline share payload is read from the URL hash", () => {
  const payload = "raw.aGVsbG8=";
  assert.equal(getInlineSharePayload(`#shareData=${payload}`), payload);
  assert.equal(getInlineSharePayload("#other=value"), null);
});
