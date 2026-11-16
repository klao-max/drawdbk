import test from "node:test";
import assert from "node:assert/strict";
import { createAiClient } from "./ai.js";

test("OpenAI-compatible client sends the current model and parses a plan", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Add the missing relation.",
                operations: [{ target: "relationship", action: "create" }],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = createAiClient({
      settings: {
        baseUrl: "https://example.test/v1",
        model: "schema-model",
        apiKey: "secret",
      },
    });
    const response = await client.chat({
      messages: [{ role: "user", content: "Connect orders to users" }],
      diagram: { database: "postgresql", tables: [], relationships: [] },
      selectedTableIds: [],
    });

    assert.equal(request.url, "https://example.test/v1/chat/completions");
    assert.equal(request.options.headers.Authorization, "Bearer secret");
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, "schema-model");
    assert.equal(response.operations.length, 1);
    assert.equal(response.message, "Add the missing relation.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("client keeps a plain-text assistant response without inventing operations", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "I need more information." } }],
      }),
      { status: 200 },
    );

  try {
    const client = createAiClient({
      settings: {
        baseUrl: "https://example.test/v1",
        model: "schema-model",
        apiKey: "secret",
      },
    });
    const response = await client.chat({
      messages: [],
      diagram: { database: "generic", tables: [], relationships: [] },
      selectedTableIds: [],
    });
    assert.deepEqual(response, {
      message: "I need more information.",
      operations: [],
      warnings: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
