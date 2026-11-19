const SHORTCUT_PROTECTED_TAG_NAMES = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
]);

export function isSpaceKey(event) {
  return (
    event.code === "Space" || event.key === " " || event.key === "Spacebar"
  );
}

export function isEditableCanvasShortcutTarget(target) {
  if (!target) return false;

  const tagName =
    typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  return (
    SHORTCUT_PROTECTED_TAG_NAMES.has(tagName) ||
    target.isContentEditable === true ||
    target.getAttribute?.("role") === "button"
  );
}

export function shouldPanCanvas({ button, spacePressed }) {
  return button === 1 || (button === 0 && spacePressed);
}
