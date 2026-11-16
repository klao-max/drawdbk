# Canvas AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configured, canvas-local AI assistant that can inspect the current schema, propose safe table/field/relationship/layout changes, preview them, apply them atomically, and undo them as one edit.

**Architecture:** Add a provider-agnostic AI context and client. The context owns in-memory model credentials, conversation state, plan validation and atomic application; the UI renders a settings modal, a canvas overlay, and a toolbar trigger. AI changes are normalized into the existing diagram plan format, while an `includePositions` option extends the existing DBML snapshot undo path without changing ordinary DBML behavior.

**Tech Stack:** React 18, Vite, Semi UI, existing React Context hooks, `nanoid`, existing Dagre/ELK layout engines, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-16-ai-canvas-chat-design.md`

## Global Constraints

- AI changes must be validated and previewed before any React state mutation.
- API keys must stay in memory and must not be written to diagram JSON, IndexedDB, or localStorage.
- Existing DBML editing must continue ignoring table positions unless `includePositions: true` is passed explicitly.
- Read-only/history diagrams can chat but cannot apply plans.
- Only tables, fields, relationships, and table layout are in scope for Phase 1.
- Use the existing `DiagramContext` actions and undo/redo contexts instead of introducing a parallel diagram state.
- Keep the OpenAI-compatible HTTP adapter optional when a host provides `ExtensionsContext.aiChat`.

---

### Task 1: Add pure plan and position-diff tests

**Files:**

- Create: `src/utils/aiPlan.test.js`
- Create: `src/utils/dbml/diff.test.js`
- Modify: `package.json: scripts`

**Interfaces:**

- Tests will define the required signatures for `buildAiDiagramSnapshot`, `validateAiPlan`, `normalizeAiPlan`, `describeAiPlan`, `applyPlanToDiagram`, and `diffDiagram(from, to, options)`.

- [ ] **Step 1: Add a test script using Node's built-in runner**

```json
"scripts": {
  "test": "node --test src/**/*.test.js"
}
```

- [ ] **Step 2: Write failing plan tests**

Cover these behaviors with plain objects:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiDiagramSnapshot,
  validateAiPlan,
  normalizeAiPlan,
  describeAiPlan,
  applyPlanToDiagram,
} from "./aiPlan.js";

const diagram = {
  database: "postgresql",
  tables: [
    {
      id: "users",
      name: "users",
      x: 10,
      y: 20,
      color: "#175e7a",
      locked: true,
      fields: [
        {
          id: "users-id",
          name: "id",
          type: "INTEGER",
          primary: true,
          unique: true,
          notNull: true,
          comment: "",
          default: "",
          check: "",
          increment: true,
        },
      ],
      comment: "",
      indices: [],
      uniqueConstraints: [],
    },
  ],
  relationships: [],
};

test("snapshot keeps schema fields but excludes presentation data", () => {
  const snapshot = buildAiDiagramSnapshot(diagram);
  assert.deepEqual(snapshot.tables[0].fields[0], {
    id: "users-id",
    name: "id",
    type: "INTEGER",
    primary: true,
    unique: true,
    notNull: true,
    comment: "",
  });
  assert.equal("x" in snapshot.tables[0], false);
  assert.equal("locked" in snapshot.tables[0], false);
});

test("normalizeAiPlan creates ids and resolves names for a new relationship", () => {
  const plan = normalizeAiPlan(
    {
      operations: [
        {
          target: "relationship",
          action: "create",
          relationship: {
            name: "orders_users",
            startTableName: "orders",
            startFieldName: "user_id",
            endTableName: "users",
            endFieldName: "id",
            cardinality: "many_to_one",
          },
        },
      ],
    },
    {
      ...diagram,
      tables: [
        ...diagram.tables,
        {
          id: "orders",
          name: "orders",
          fields: [{ id: "orders-user", name: "user_id", type: "INTEGER" }],
        },
      ],
    },
  );
  assert.equal(plan.operations[0].relationship.startTableId, "orders");
  assert.equal(plan.operations[0].relationship.endFieldId, "users-id");
  assert.match(plan.operations[0].relationship.id, /^ai-/);
});

test("validateAiPlan rejects unresolved references and unsupported layouts", () => {
  const result = validateAiPlan(
    {
      operations: [
        {
          target: "relationship",
          action: "create",
          relationship: {
            startTableId: "missing",
            startFieldId: "missing",
            endTableId: "users",
            endFieldId: "users-id",
          },
        },
      ],
      layout: { engineId: "unknown" },
    },
    diagram,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /missing|unknown/);
});

test("applyPlanToDiagram applies table and relationship operations without mutating input", () => {
  const result = applyPlanToDiagram(diagram, {
    operations: [
      {
        target: "table",
        action: "update",
        id: "users",
        values: { name: "accounts" },
      },
    ],
  });
  assert.equal(result.tables[0].name, "accounts");
  assert.equal(diagram.tables[0].name, "users");
});

test("describeAiPlan returns counts for preview", () => {
  const description = describeAiPlan({
    operations: [{ target: "relationship", action: "create" }],
    layout: { engineId: "elk_layered" },
  });
  assert.deepEqual(description, {
    creates: 1,
    updates: 0,
    deletes: 0,
    layout: "elk_layered",
    destructive: false,
  });
});
```

- [ ] **Step 3: Write failing position diff tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { diffDiagram } from "./diff.js";

test("diffDiagram ignores positions by default", () => {
  const from = {
    tables: [{ id: "t", x: 0, y: 0, fields: [] }],
    relationships: [],
  };
  const to = {
    tables: [{ id: "t", x: 100, y: 200, fields: [] }],
    relationships: [],
  };
  assert.deepEqual(diffDiagram(from, to), []);
});

test("diffDiagram includes positions when requested", () => {
  const from = {
    tables: [{ id: "t", x: 0, y: 0, fields: [] }],
    relationships: [],
  };
  const to = {
    tables: [{ id: "t", x: 100, y: 200, fields: [] }],
    relationships: [],
  };
  assert.deepEqual(diffDiagram(from, to, { includePositions: true }), [
    { target: "table", action: "update", id: "t", values: { x: 100, y: 200 } },
  ]);
});
```

- [ ] **Step 4: Run the tests and confirm the expected missing-module failure**

Run: `npm test`

Expected: FAIL because `src/utils/aiPlan.js` is not defined and `diffDiagram` does not yet accept position options.

- [ ] **Step 5: Commit the tests once the repository permits git writes**

```bash
git add package.json src/utils/aiPlan.test.js src/utils/dbml/diff.test.js
git commit -m "test: define canvas AI plan behavior"
```

---

### Task 2: Implement AI plan normalization and position-aware diffing

**Files:**

- Create: `src/utils/aiPlan.js`
- Modify: `src/utils/dbml/diff.js`

**Interfaces:**

- Produces the pure functions used by Task 1.
- `diffDiagram(from, to, { includePositions = false } = {})` returns existing operation shapes and adds `x/y` only when requested.

- [ ] **Step 1: Implement `buildAiDiagramSnapshot`**

Copy only `database`, table `id/name/comment`, field `id/name/type/primary/unique/notNull/comment`, and relationship identity/cardinality/constraints. Omit positions, colors, locks, notes, areas, views, defaults, checks, and increments.

- [ ] **Step 2: Implement reference resolution helpers**

Resolve a table or field by exact ID first, then by exact name. If a name maps to zero or multiple entries, add a validation error. Keep IDs stable for existing entities and generate `ai-` prefixed unique IDs for new relationships and new fields/tables that omit IDs.

- [ ] **Step 3: Implement `validateAiPlan`**

Validate the operation target/action whitelist, required IDs, field/table existence, relationship endpoints, duplicate relationships, and layout engine whitelist. Return `{ valid, errors, warnings }` without throwing.

- [ ] **Step 4: Implement `normalizeAiPlan`**

Return a deep-cloned plan with resolved IDs, generated IDs, default relationship constraints, and normalized `warnings`. Throw an `Error` only when the plan cannot be safely normalized; callers use `validateAiPlan` first.

- [ ] **Step 5: Implement `applyPlanToDiagram`**

Apply table creates/updates/deletes, table field replacements, field updates, and relationship creates/updates/deletes to a cloned `{ tables, relationships, enums }` object. When deleting a table, remove relationships referencing it. Do not mutate the input.

- [ ] **Step 6: Implement `describeAiPlan`**

Count create/update/delete operations, expose `layout.engineId`, and set `destructive` when any `table.delete` or `relationship.delete` exists.

- [ ] **Step 7: Add optional position keys to `diffDiagram`**

Keep `TABLE_KEYS` unchanged by default. When `includePositions` is true, compare `x` and `y` along with the existing table keys. Leave DBML editor behavior unchanged.

- [ ] **Step 8: Run the focused tests and then the full test command**

Run: `node --test src/utils/aiPlan.test.js src/utils/dbml/diff.test.js`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failures.

---

### Task 3: Add the AI client and context state

**Files:**

- Create: `src/api/ai.js`
- Create: `src/context/AiContext.jsx`
- Create: `src/hooks/useAi.js`
- Modify: `src/hooks/index.js`
- Modify: `src/pages/Editor.jsx`

**Interfaces:**

- `createAiClient({ settings, extension })` returns `{ chat }`.
- `AiContext` provides `aiSettings`, `apiKey`, `isConfigured`, `isOpen`, `settingsOpen`, `messages`, `status`, `pendingPlans`, `open`, `close`, `openSettings`, `closeSettings`, `sendMessage`, `applyPlan`, `dismissPlan`, `saveAiSettings`, `setApiKey`, and `clearConversation`.

- [ ] **Step 1: Write a failing client test**

Create `src/api/ai.test.js` with a fake `fetch` that verifies the OpenAI-compatible URL, authorization header, model, and parsed JSON envelope. Add a second test for a plain-text response that returns `{ message, operations: [] }`.

- [ ] **Step 2: Run the client test to confirm RED**

Run: `node --test src/api/ai.test.js`

Expected: FAIL because `src/api/ai.js` is missing.

- [ ] **Step 3: Implement `createAiClient`**

Use an injected extension function when present. Otherwise POST to `${baseUrl}/chat/completions`, send a system instruction requiring the response envelope, include the schema snapshot as a JSON message, parse the assistant content as JSON when possible, and return a text-only response when parsing fails. Throw descriptive errors for non-2xx responses and missing configuration.

- [ ] **Step 4: Implement the AI context**

Load persisted non-secret settings from `localStorage`. Keep `apiKey` in React state only. Read `tables`, `relationships`, `database`, `areas`, `settings`, `selectedElement`, and `bulkSelectedElements` through existing hooks. On `sendMessage`, build a fresh snapshot, call the client, validate and normalize the returned plan, and append assistant messages with an attached plan.

- [ ] **Step 5: Implement atomic `applyPlan`**

Revalidate the pending plan against the latest diagram, compute the pure next diagram, run the requested layout engine against that next diagram, generate a position-aware diff, push one `ObjectType.DBML` undo entry with `includePositions: true`, clear redo, apply the diff through existing DiagramContext actions, and remove the pending plan. Reject when `layout.readOnly` is true.

- [ ] **Step 6: Wire the provider into the editor**

Wrap `WorkSpace` with `AiContextProvider` inside the existing diagram/save contexts so the provider can use DiagramContext actions and Workspace/ControlPanel can consume `useAi`.

- [ ] **Step 7: Run focused client and utility tests**

Run: `npm test`

Expected: PASS.

---

### Task 4: Add model settings UI

**Files:**

- Create: `src/components/AiSettingsModal.jsx`
- Modify: `src/components/EditorHeader/ControlPanel.jsx`
- Modify: `src/i18n/locales/en.js`
- Modify: `src/i18n/locales/zh.js`

**Interfaces:**

- `AiSettingsModal` consumes `useAi` and renders controlled fields for enabled, base URL, model, and API key.
- ControlPanel's Settings menu calls `openSettings()`.

- [ ] **Step 1: Implement the settings modal shell**

Use Semi UI `Modal`, `Input`, `Switch`, `Button`, `Banner`, and `Typography`. Show whether an extension-backed client is available, keep the API key input password-masked, and never display the current key value.

- [ ] **Step 2: Implement save/cancel behavior**

Save only enabled/provider/baseUrl/model to localStorage through context, keep the entered API key in memory, close the modal, and show validation errors for missing model or malformed base URL.

- [ ] **Step 3: Add the Settings menu item**

Add `ai_model` under the existing `settings` menu object and render `AiSettingsModal` from ControlPanel or Workspace using context state. Keep the menu available in read-only mode so users can configure the client while viewing history.

- [ ] **Step 4: Add English and Simplified Chinese strings**

Add labels for AI assistant, model settings, provider, base URL, model, API key, enable, save, not configured, apply changes, and related status/errors. Other locales fall back to English.

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS with zero warnings and errors.

---

### Task 5: Add the canvas chat panel and toolbar trigger

**Files:**

- Create: `src/components/AiChatPanel.jsx`
- Modify: `src/components/Workspace.jsx`
- Modify: `src/components/EditorHeader/ControlPanel.jsx`
- Modify: `src/icons/index.js` if the existing sparkles icon is not reusable
- Modify: `src/i18n/locales/en.js`
- Modify: `src/i18n/locales/zh.js`

**Interfaces:**

- `AiChatPanel` reads all state and actions from `useAi`; it does not call DiagramContext setters directly.
- Toolbar AI button calls `open()` and is disabled only when the editor is unavailable, not when the model is unconfigured.

- [ ] **Step 1: Render the panel empty state**

Place the panel absolutely inside the canvas area, with a close button, title, schema summary, and an unconfigured state that links to the settings modal.

- [ ] **Step 2: Render conversation messages**

Render user and assistant bubbles, loading indicator, error banner with retry, and quick prompt buttons. Keep the input enabled while an assistant response is visible and disable send while loading.

- [ ] **Step 3: Render plan previews**

For assistant messages with a plan, show operation counts and expandable operation rows. Use `Popconfirm` for destructive plans and disable Apply when `layout.readOnly` is true. Apply calls `applyPlan(message.plan)` and dismiss removes only that plan.

- [ ] **Step 4: Add the toolbar trigger**

Add an IconSparkles button beside auto arrange. Add a tooltip and theme-aware disabled styling. The button opens the panel without changing canvas selection or transform.

- [ ] **Step 5: Mount the panel and settings modal**

Render both in `Workspace` near the canvas overlay slot. Keep `Slot name="canvas-overlay"` available for host extensions.

- [ ] **Step 6: Run lint and build**

Run: `npm run lint && npm run build`

Expected: both commands exit 0.

---

### Task 6: Wire undo/redo positions and complete verification

**Files:**

- Modify: `src/components/EditorHeader/ControlPanel.jsx`
- Modify: `src/utils/dbml/diff.js` if any integration fix is needed
- Modify: `src/utils/dbml/applyPlan.js` only if the AI plan needs a missing operation shape

**Interfaces:**

- Existing `swapDbmlSnapshot` consumes `entry.data.includePositions`.
- Existing ordinary DBML editing remains backward compatible.

- [ ] **Step 1: Add the includePositions flag to DBML undo snapshots**

When undoing or redoing a DBML entry, call `diffDiagram(current, entry.data.snapshot, { includePositions: Boolean(entry.data.includePositions) })`. AI entries set the flag; DBML editor entries omit it.

- [ ] **Step 2: Add a regression test for the snapshot behavior**

Extend `src/utils/dbml/diff.test.js` to assert that a position-aware diff can be applied through `applyDiagramPlan` and restores `x/y`.

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; all intended files are visible. If git metadata remains read-only, report that the changes are present but uncommitted.

- [ ] **Step 5: Commit when repository permissions allow**

```bash
git add docs/superpowers/specs/2026-11-16-ai-canvas-chat-design.md docs/superpowers/plans/2026-11-16-ai-canvas-chat.md package.json src
 git commit -m "feat: add canvas AI assistant"
```
