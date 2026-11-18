import { noteWidth } from "../data/constants";
import {
  getRelatedFieldKeysByTable,
  getTableHeight,
  getTableWidth,
} from "./utils";
import {
  getViewHeight,
  getViewWidth,
  resolveViewColumns,
} from "./views";

function createBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function addBounds(bounds, x, y, width, height) {
  if (
    ![x, y, width, height].every((value) => Number.isFinite(value)) ||
    width < 0 ||
    height < 0
  ) {
    return;
  }

  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x + width);
  bounds.maxY = Math.max(bounds.maxY, y + height);
}

export function calculateDiagramBounds({
  tables = [],
  relationships = [],
  views = [],
  areas = [],
  notes = [],
  showComments = true,
} = {}) {
  const bounds = createBounds();
  const relatedFieldKeysByTable = getRelatedFieldKeysByTable(relationships);

  for (const table of tables) {
    if (!table) continue;
    addBounds(
      bounds,
      table?.x,
      table?.y,
      getTableWidth(table),
      getTableHeight(
        table,
        showComments,
        relatedFieldKeysByTable.get(table?.id),
      ),
    );
  }

  for (const view of views) {
    if (!view) continue;
    addBounds(
      bounds,
      view?.x,
      view?.y,
      getViewWidth(view),
      getViewHeight(
        view,
        resolveViewColumns(view, tables),
        showComments,
      ),
    );
  }

  for (const area of areas) {
    addBounds(bounds, area?.x, area?.y, area?.width, area?.height);
  }

  for (const note of notes) {
    addBounds(
      bounds,
      note?.x,
      note?.y,
      note?.width ?? noteWidth,
      note?.height,
    );
  }

  return Number.isFinite(bounds.minX) ? bounds : null;
}
