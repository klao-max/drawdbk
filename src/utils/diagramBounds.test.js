import test from "node:test";
import assert from "node:assert/strict";
import { calculateDiagramBounds } from "./diagramBounds.js";

test("diagram bounds include imported tables and relationships", () => {
  const bounds = calculateDiagramBounds({
    tables: [
      {
        id: "users",
        x: 10,
        y: 20,
        name: "users",
        comment: "",
        fields: [{ id: "users-id", name: "id", type: "INTEGER" }],
      },
      {
        id: "tasks",
        x: 500,
        y: 300,
        name: "tasks",
        comment: "",
        fields: [{ id: "tasks-id", name: "id", type: "INTEGER" }],
      },
    ],
    relationships: [
      {
        startTableId: "tasks",
        startFieldId: "tasks-id",
        endTableId: "users",
        endFieldId: "users-id",
      },
    ],
  });

  assert.deepEqual(bounds, {
    minX: 10,
    minY: 20,
    maxX: 720,
    maxY: 394,
  });
});

test("diagram bounds ignore incomplete elements and report empty diagrams", () => {
  assert.equal(
    calculateDiagramBounds({
      tables: [null, { x: Number.NaN, y: 0, fields: [] }],
      views: [null],
      areas: [{ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }],
      notes: [{ x: 0, y: 0, height: Number.NaN }],
    }),
    null,
  );

  assert.equal(calculateDiagramBounds(), null);
});
