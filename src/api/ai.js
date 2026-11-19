const SYSTEM_PROMPT = `You are a database schema assistant inside drawDB.
Return one JSON object with this exact top-level shape: {"message":"string","operations":[],"layout":null,"warnings":[]}.
Only propose table, field, relationship, and layout changes. Never execute SQL.
Use exact table and field IDs from the supplied schema.
For a table rename, return an operation like {"target":"table","action":"update","id":"existing table id","values":{"name":"中文名（english_name）"}}. The id may also be supplied as tableId, and the existing name may be supplied as tableName.
For a request to arrange tables by logical modules, return layout {"engineId":"by_module","columns":4,"groups":[{"name":"module name","tableIds":["existing table id"]}]} and include every table you want moved in exactly one group. The groups are executable data, not just a description in message.
For a normal automatic layout, use one of dagre_left_to_right, dagre_top_to_bottom, elk_layered, elk_stress.
Do not use by_subject_area unless the user explicitly asks to arrange existing subject areas.
If you cannot produce an executable change, return an empty operations array and layout null, and explain why in message. Never claim that a table was modified when operations is empty and layout is null.`;

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
