import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStoredAiApiKey,
  loadStoredAiApiKey,
  saveStoredAiApiKey,
} from "./aiKeyStorage.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("remembered API keys survive reload through browser storage", () => {
  const storage = createStorage();

  saveStoredAiApiKey(storage, "sk-test", true);

  assert.equal(loadStoredAiApiKey(storage), "sk-test");
});

test("unremembering an API key removes the browser-stored value", () => {
  const storage = createStorage();
  saveStoredAiApiKey(storage, "sk-test", true);

  saveStoredAiApiKey(storage, "sk-test", false);

  assert.equal(loadStoredAiApiKey(storage), "");
});

test("clearing an API key removes the browser-stored value", () => {
  const storage = createStorage();
  saveStoredAiApiKey(storage, "sk-test", true);

  clearStoredAiApiKey(storage);

  assert.equal(loadStoredAiApiKey(storage), "");
});
