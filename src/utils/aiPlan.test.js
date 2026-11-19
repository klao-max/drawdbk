import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiDiagramSnapshot,
  validateAiPlan,
  normalizeAiPlan,
  describeAiPlan,
  applyPlanToDiagram,
} from "./aiPlan.js";
import { runLayout } from "./layout.js";

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

test("applyPlanToDiagram applies table operations without mutating input", () => {
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

test("AI table rename accepts tableId references", () => {
  const plan = normalizeAiPlan(
    {
      operations: [
        {
          target: "table",
          action: "update",
          tableId: "users",
          values: { name: "用户（users）" },
        },
      ],
    },
    diagram,
  );
  const result = applyPlanToDiagram(diagram, plan);

  assert.equal(result.tables[0].name, "用户（users）");
});

test("AI table position updates survive normalization and application", () => {
  const plan = normalizeAiPlan(
    {
      operations: [
        {
          target: "table",
          action: "update",
          id: "users",
          values: { x: 640, y: 320 },
        },
      ],
    },
    diagram,
  );
  const result = applyPlanToDiagram(diagram, plan);

  assert.deepEqual(
    { x: result.tables[0].x, y: result.tables[0].y },
    { x: 640, y: 320 },
  );
});

test("module layout plans preserve groups and move table positions", () => {
  const current = {
    ...diagram,
    tables: [
      { ...diagram.tables[0], locked: false },
      {
        id: "orders",
        name: "orders",
        x: 0,
        y: 0,
        fields: [{ id: "orders-id", name: "id", type: "INTEGER" }],
      },
    ],
  };
  const plan = normalizeAiPlan(
    {
      operations: [],
      layout: {
        engineId: "by_module",
        columns: 4,
        groups: [
          { name: "identity", tableIds: ["users"] },
          { name: "work", tableIds: ["orders"] },
        ],
      },
    },
    current,
  );
  const result = runLayout(
    plan.layout.engineId,
    {
      ...current,
      areas: [],
      settings: { showComments: true },
    },
    plan.layout,
  );

  assert.deepEqual(plan.layout.groups, [
    { name: "identity", tableIds: ["users"] },
    { name: "work", tableIds: ["orders"] },
  ]);
  assert.equal(result.tables.length, 2);
  assert.notDeepEqual(result.tables, [
    { id: "users", x: 10, y: 20 },
    { id: "orders", x: 0, y: 0 },
  ]);
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
