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
