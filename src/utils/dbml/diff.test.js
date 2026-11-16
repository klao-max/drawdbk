import test from "node:test";
import assert from "node:assert/strict";
import { diffDiagram } from "./diff.js";
import { applyDiagramPlan } from "./applyPlan.js";

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
    {
      target: "table",
      action: "update",
      id: "t",
      values: { x: 100, y: 200 },
    },
  ]);
});

test("position-aware diff can be applied through the existing plan applier", () => {
  const from = {
    tables: [{ id: "t", x: 0, y: 0, fields: [] }],
    relationships: [],
  };
  const to = {
    tables: [{ id: "t", x: 100, y: 200, fields: [] }],
    relationships: [],
  };
  const next = structuredClone(from);
  applyDiagramPlan(diffDiagram(from, to, { includePositions: true }), {
    updateTable: (id, values) => {
      const table = next.tables.find((item) => item.id === id);
      Object.assign(table, values);
    },
  });
  assert.deepEqual(next.tables[0], to.tables[0]);
});
