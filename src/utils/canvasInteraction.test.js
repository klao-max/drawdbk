import test from "node:test";
import assert from "node:assert/strict";
import {
  isEditableCanvasShortcutTarget,
  isSpaceKey,
  shouldPanCanvas,
} from "./canvasInteraction.js";

test("canvas panning uses space plus left drag and keeps middle drag compatible", () => {
  assert.equal(shouldPanCanvas({ button: 0, spacePressed: false }), false);
  assert.equal(shouldPanCanvas({ button: 0, spacePressed: true }), true);
  assert.equal(shouldPanCanvas({ button: 1, spacePressed: false }), true);
  assert.equal(shouldPanCanvas({ button: 2, spacePressed: true }), false);
});

test("space shortcut recognizes keyboard space events", () => {
  assert.equal(isSpaceKey({ code: "Space" }), true);
  assert.equal(isSpaceKey({ key: " " }), true);
  assert.equal(isSpaceKey({ key: "Spacebar" }), true);
  assert.equal(isSpaceKey({ key: "Enter", code: "Enter" }), false);
});

test("space shortcut does not steal focus from editable controls", () => {
  assert.equal(isEditableCanvasShortcutTarget({ tagName: "input" }), true);
  assert.equal(isEditableCanvasShortcutTarget({ tagName: "textarea" }), true);
  assert.equal(
    isEditableCanvasShortcutTarget({ tagName: "div", isContentEditable: true }),
    true,
  );
  assert.equal(isEditableCanvasShortcutTarget({ tagName: "button" }), true);
  assert.equal(isEditableCanvasShortcutTarget({ tagName: "svg" }), false);
});
