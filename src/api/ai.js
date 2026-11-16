const SYSTEM_PROMPT = `You are a database schema assistant inside drawDB.\nReturn a single JSON object with this shape: {"message":"string","operations":[],"layout":null,"warnings":[]}.\nOnly propose table, field, relationship, and layout operations. Never execute SQL. Use the exact IDs from the supplied schema when they exist. If the request is ambiguous, return an empty operations array and explain why in message.`;

function stripJsonFence(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

function parseAssistantContent(content) {
  const text = Array.isArray(content)
    ? content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n")
    : String(content ?? "");
  const normalized = stripJsonFence(text);

  try {
    const parsed = JSON.parse(normalized);
    return {
      message: parsed.message ?? "",
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      ...(parsed.layout && { layout: parsed.layout }),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch {
    return { message: text, operations: [], warnings: [] };
  }
}

function normalizeExtensionResponse(response) {
  if (typeof response === "string") return parseAssistantContent(response);
  if (!response || typeof response !== "object") {
    return { message: "", operations: [], warnings: [] };
  }
  if (response.choices?.[0]?.message?.content !== undefined) {
    return parseAssistantContent(response.choices[0].message.content);
  }
  return {
    message: response.message ?? "",
    operations: Array.isArray(response.operations) ? response.operations : [],
    ...(response.layout && { layout: response.layout }),
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
  };
}

function endpointFor(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
}

export function createAiClient({ settings, extension } = {}) {
  const config = settings ?? {};

  async function chat(payload) {
    if (typeof extension === "function") {
      return normalizeExtensionResponse(await extension(payload));
    }

    if (!config.baseUrl || !config.model) {
      throw new Error("Configure an AI base URL and model first.");
    }
    if (!config.apiKey) {
      throw new Error("Enter an AI API key first.");
    }
    if (typeof fetch !== "function") {
      throw new Error("This browser does not provide fetch.");
    }

    const contextMessage = [
      "Current drawDB schema context:",
      JSON.stringify({
        database: payload.database,
        diagram: payload.diagram,
        selectedTableIds: payload.selectedTableIds ?? [],
      }),
    ].join("\n");

    const response = await fetch(endpointFor(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature ?? 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(payload.messages ?? []),
          { role: "system", content: contextMessage },
        ],
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // Keep the status-only error when the provider has no readable body.
      }
      throw new Error(
        `AI request failed (${response.status})${detail ? `: ${detail}` : "."}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return parseAssistantContent(content);
  }

  return { chat };
}

export { SYSTEM_PROMPT, parseAssistantContent };
