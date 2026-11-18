import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFitTransform,
  minimumFitZoom,
} from "./fitTransform.js";

test("fit transform clamps very large diagrams to a visible zoom", () => {
  const result = calculateFitTransform({
    canvasWidth: 1200,
    canvasHeight: 700,
    minX: 0,
    minY: 0,
    maxX: 100000,
    maxY: 100000,
  });

  assert.equal(result.zoom, minimumFitZoom);
  assert.deepEqual(result.pan, { x: 50000, y: 50000 });
});

test("fit transform ignores invalid canvas or diagram bounds", () => {
  assert.equal(
    calculateFitTransform({
      canvasWidth: 0,
      canvasHeight: 700,
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    }),
    null,
  );
  assert.equal(
    calculateFitTransform({
      canvasWidth: 1200,
      canvasHeight: 700,
      minX: Number.NaN,
      minY: 0,
      maxX: 100,
      maxY: 100,
    }),
    null,
  );
});
