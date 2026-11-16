import { Cardinality, Constraint, defaultBlue } from "../data/constants.js";

const ALLOWED_LAYOUTS = new Set([
  "dagre_left_to_right",
  "dagre_top_to_bottom",
  "elk_layered",
  "elk_stress",
  "by_subject_area",
]);

const TABLE_UPDATE_KEYS = new Set(["name", "comment", "fields", "x", "y"]);
const FIELD_UPDATE_KEYS = new Set([
  "name",
  "type",
  "size",
  "default",
  "check",
  "primary",
  "unique",
  "notNull",
  "increment",
  "unsigned",
  "comment",
  "values",
]);

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function newAiId() {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `ai-${random}`;
}

function valuesFor(value, keys) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([key]) => keys.has(key)),
  );
}

function listFor(diagram) {
  return {
    tables: Array.isArray(diagram?.tables) ? diagram.tables : [],
    relationships: Array.isArray(diagram?.relationships)
      ? diagram.relationships
      : [],
  };
}

function findByIdOrName(items, id, name) {
  if (id !== undefined && id !== null && id !== "") {
    const byId = items.find((item) => item.id === id);
    if (byId) return { item: byId };
  }

  if (name !== undefined && name !== null && String(name).trim()) {
    const matches = items.filter((item) => item.name === name);
    if (matches.length === 1) return { item: matches[0] };
    if (matches.length > 1) return { error: `Name "${name}" is ambiguous.` };
  }

  return {
    error: `Could not resolve ${id || name || "an entity"}.`,
  };
}

function resolveTable(diagram, ref, errors) {
  const { tables } = listFor(diagram);
  const result = findByIdOrName(tables, ref?.id, ref?.name);
  if (!result.item && result.error) errors.push(result.error);
  return result.item;
}

function resolveField(table, ref, errors) {
  const fields = Array.isArray(table?.fields) ? table.fields : [];
  const result = findByIdOrName(fields, ref?.id, ref?.name);
  if (!result.item && result.error) errors.push(result.error);
  return result.item;
}

function tableRef(value, idKey, nameKey) {
  return {
    id: value?.[idKey],
    name: value?.[nameKey],
  };
}

function fieldRef(value, idKey, nameKey) {
  return {
    id: value?.[idKey],
    name: value?.[nameKey],
  };
}

function relationshipKey(relationship) {
  const fields = (relationship.fields ?? []).map(
    (pair) => `${pair.startFieldId}:${pair.endFieldId}`,
  );
  return [
    relationship.startTableId,
    relationship.endTableId,
    relationship.startFieldId,
    relationship.endFieldId,
    fields.join(","),
  ].join("|");
}

function validateTableOperation(operation, diagram, errors) {
  if (operation.action === "create") {
    const table = operation.table;
    if (!table || !String(table.name ?? "").trim()) {
      errors.push("A table.create operation requires a table name.");
      return;
    }
    if (!Array.isArray(table.fields)) {
      errors.push(`Table "${table.name}" must include a fields array.`);
    }
    return;
  }

  const table = resolveTable(
    diagram,
    { id: operation.id, name: operation.name },
    errors,
  );
  if (!table) return;

  if (operation.action === "update") {
    const values = operation.values;
    if (!values || typeof values !== "object") {
      errors.push("A table.update operation requires values.");
      return;
    }
    const unsupported = Object.keys(values).filter(
      (key) => !TABLE_UPDATE_KEYS.has(key),
    );
    if (unsupported.length) {
      errors.push(`Unsupported table fields: ${unsupported.join(", ")}.`);
    }
  }
}

function validateFieldOperation(operation, diagram, errors) {
  const table = resolveTable(
    diagram,
    tableRef(operation, "tableId", "tableName"),
    errors,
  );
  if (!table) return;

  if (operation.action === "create") {
    if (!operation.field || !String(operation.field.name ?? "").trim()) {
      errors.push("A field.create operation requires a field name.");
    }
    return;
  }

  const field = resolveField(
    table,
    fieldRef(operation, "fieldId", "fieldName"),
    errors,
  );
  if (!field) return;

  if (operation.action === "update") {
    const values = operation.values;
    if (!values || typeof values !== "object") {
      errors.push("A field.update operation requires values.");
      return;
    }
    const unsupported = Object.keys(values).filter(
      (key) => !FIELD_UPDATE_KEYS.has(key),
    );
    if (unsupported.length) {
      errors.push(`Unsupported field properties: ${unsupported.join(", ")}.`);
    }
  }
}

function validateRelationshipOperation(operation, diagram, errors) {
  if (operation.action === "create") {
    const relationship = operation.relationship;
    if (!relationship || typeof relationship !== "object") {
      errors.push("A relationship.create operation requires a relationship.");
      return;
    }

    const startTable = resolveTable(
      diagram,
      tableRef(relationship, "startTableId", "startTableName"),
      errors,
    );
    const endTable = resolveTable(
      diagram,
      tableRef(relationship, "endTableId", "endTableName"),
      errors,
    );
    if (startTable) {
      resolveField(
        startTable,
        fieldRef(relationship, "startFieldId", "startFieldName"),
        errors,
      );
    }
    if (endTable) {
      resolveField(
        endTable,
        fieldRef(relationship, "endFieldId", "endFieldName"),
        errors,
      );
    }
    return;
  }

  const { relationships } = listFor(diagram);
  const result = findByIdOrName(relationships, operation.id, operation.name);
  if (!result.item && result.error) errors.push(result.error);
  if (
    operation.action === "update" &&
    (!operation.values || typeof operation.values !== "object")
  ) {
    errors.push("A relationship.update operation requires values.");
  }
}

export function buildAiDiagramSnapshot(diagram) {
  const { tables, relationships } = listFor(diagram);
  return {
    database: diagram?.database,
    tables: tables.map((table) => ({
      id: table.id,
      name: table.name,
      comment: table.comment ?? "",
      fields: (table.fields ?? []).map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        primary: Boolean(field.primary),
        unique: Boolean(field.unique),
        notNull: Boolean(field.notNull),
        comment: field.comment ?? "",
      })),
    })),
    relationships: relationships.map((relationship) => ({
      id: relationship.id,
      name: relationship.name,
      startTableId: relationship.startTableId,
      startFieldId: relationship.startFieldId,
      endTableId: relationship.endTableId,
      endFieldId: relationship.endFieldId,
      fields: relationship.fields,
      cardinality: relationship.cardinality,
      updateConstraint: relationship.updateConstraint,
      deleteConstraint: relationship.deleteConstraint,
    })),
  };
}

export function validateAiPlan(plan, diagram) {
  const errors = [];
  const warnings = Array.isArray(plan?.warnings) ? [...plan.warnings] : [];
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];

  if (!plan || typeof plan !== "object") {
    return {
      valid: false,
      errors: ["AI response must be an object."],
      warnings,
    };
  }

  for (const operation of operations) {
    if (!operation || typeof operation !== "object") {
      errors.push("Every AI operation must be an object.");
      continue;
    }
    if (!["table", "field", "relationship"].includes(operation.target)) {
      errors.push(`Unsupported AI target "${operation.target}".`);
      continue;
    }
    if (!["create", "update", "delete"].includes(operation.action)) {
      errors.push(`Unsupported AI action "${operation.action}".`);
      continue;
    }

    if (operation.target === "table") {
      validateTableOperation(operation, diagram, errors);
    } else if (operation.target === "field") {
      validateFieldOperation(operation, diagram, errors);
    } else {
      validateRelationshipOperation(operation, diagram, errors);
    }
  }

  if (plan.layout?.engineId && !ALLOWED_LAYOUTS.has(plan.layout.engineId)) {
    errors.push(`Unsupported layout engine "${plan.layout.engineId}".`);
  }

  const knownKeys = new Set(
    listFor(diagram).relationships.map((relationship) =>
      relationshipKey(relationship),
    ),
  );
  for (const operation of operations) {
    if (operation.target !== "relationship" || operation.action !== "create") {
      continue;
    }
    const relationship = operation.relationship;
    if (
      relationship?.startTableId &&
      relationship?.startFieldId &&
      relationship?.endTableId &&
      relationship?.endFieldId
    ) {
      const key = relationshipKey(relationship);
      if (knownKeys.has(key))
        warnings.push("A duplicate relationship was skipped.");
      knownKeys.add(key);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function normalizeField(field, existingField) {
  const source = { ...existingField, ...field };
  return {
    id: source.id ?? newAiId(),
    name: source.name ?? "",
    type: source.type ?? "",
    default: source.default ?? "",
    check: source.check ?? "",
    primary: Boolean(source.primary),
    unique: Boolean(source.unique),
    unsigned: Boolean(source.unsigned),
    notNull: Boolean(source.notNull),
    increment: Boolean(source.increment),
    comment: source.comment ?? "",
    ...(source.size !== undefined && { size: source.size }),
    ...(source.values !== undefined && { values: source.values }),
  };
}

function normalizeTable(table, existingTable) {
  const existingFields = new Map(
    (existingTable?.fields ?? []).map((field) => [field.name, field]),
  );
  return {
    id: table.id ?? newAiId(),
    name: table.name ?? existingTable?.name ?? "",
    x: table.x ?? existingTable?.x ?? 0,
    y: table.y ?? existingTable?.y ?? 0,
    width: table.width ?? existingTable?.width ?? 220,
    locked: Boolean(table.locked ?? existingTable?.locked),
    fields: (table.fields ?? existingTable?.fields ?? []).map((field) =>
      normalizeField(
        field,
        field.id
          ? existingTable?.fields?.find((item) => item.id === field.id)
          : existingFields.get(field.name),
      ),
    ),
    comment: table.comment ?? existingTable?.comment ?? "",
    indices: table.indices ?? existingTable?.indices ?? [],
    uniqueConstraints:
      table.uniqueConstraints ?? existingTable?.uniqueConstraints ?? [],
    color: table.color ?? existingTable?.color ?? defaultBlue,
    collapsed: Boolean(table.collapsed ?? existingTable?.collapsed),
  };
}

function resolveRelationship(diagram, operation) {
  const { relationships } = listFor(diagram);
  return findByIdOrName(relationships, operation.id, operation.name).item;
}

export function normalizeAiPlan(plan, diagram) {
  const validation = validateAiPlan(plan, diagram);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const normalized = {
    message: plan.message ?? "",
    warnings: validation.warnings,
    operations: [],
    ...(plan.layout?.engineId && {
      layout: { engineId: plan.layout.engineId },
    }),
  };

  for (const operation of plan.operations ?? []) {
    if (operation.target === "table") {
      if (operation.action === "create") {
        normalized.operations.push({
          target: "table",
          action: "create",
          table: normalizeTable(operation.table),
        });
        continue;
      }
      const table = resolveTable(
        diagram,
        { id: operation.id, name: operation.name },
        [],
      );
      normalized.operations.push({
        target: "table",
        action: operation.action,
        id: table.id,
        ...(operation.action === "update" && {
          values: {
            ...valuesFor(operation.values, TABLE_UPDATE_KEYS),
            ...(operation.values?.fields && {
              fields: normalizeTable({ fields: operation.values.fields }, table)
                .fields,
            }),
          },
        }),
      });
      continue;
    }

    if (operation.target === "field") {
      const table = resolveTable(
        diagram,
        tableRef(operation, "tableId", "tableName"),
        [],
      );
      const field = resolveField(
        table,
        fieldRef(operation, "fieldId", "fieldName"),
        [],
      );
      normalized.operations.push({
        target: "field",
        action: operation.action,
        tableId: table.id,
        ...(operation.action === "create"
          ? { field: normalizeField(operation.field) }
          : { fieldId: field.id }),
        ...(operation.action === "update" && {
          values: valuesFor(operation.values, FIELD_UPDATE_KEYS),
        }),
      });
      continue;
    }

    if (operation.action === "create") {
      const relationship = operation.relationship;
      const startTable = resolveTable(
        diagram,
        tableRef(relationship, "startTableId", "startTableName"),
        [],
      );
      const endTable = resolveTable(
        diagram,
        tableRef(relationship, "endTableId", "endTableName"),
        [],
      );
      const startField = resolveField(
        startTable,
        fieldRef(relationship, "startFieldId", "startFieldName"),
        [],
      );
      const endField = resolveField(
        endTable,
        fieldRef(relationship, "endFieldId", "endFieldName"),
        [],
      );
      normalized.operations.push({
        target: "relationship",
        action: "create",
        relationship: {
          ...relationship,
          id: relationship.id ?? newAiId(),
          startTableId: startTable.id,
          startFieldId: startField.id,
          endTableId: endTable.id,
          endFieldId: endField.id,
          cardinality: relationship.cardinality ?? Cardinality.MANY_TO_ONE,
          updateConstraint: relationship.updateConstraint ?? Constraint.NONE,
          deleteConstraint: relationship.deleteConstraint ?? Constraint.NONE,
          fields: relationship.fields ?? [
            { startFieldId: startField.id, endFieldId: endField.id },
          ],
        },
      });
      continue;
    }

    const relationship = resolveRelationship(diagram, operation);
    normalized.operations.push({
      target: "relationship",
      action: operation.action,
      id: relationship.id,
      ...(operation.action === "update" && {
        values: { ...operation.values },
      }),
    });
  }

  return normalized;
}

export function describeAiPlan(plan) {
  const counts = { creates: 0, updates: 0, deletes: 0 };
  for (const operation of plan?.operations ?? []) {
    if (operation.action === "create") counts.creates += 1;
    if (operation.action === "update") counts.updates += 1;
    if (operation.action === "delete") counts.deletes += 1;
  }
  return {
    ...counts,
    layout: plan?.layout?.engineId ?? null,
    destructive: counts.deletes > 0,
  };
}

export function applyPlanToDiagram(diagram, plan) {
  const next = clone({
    tables: diagram?.tables ?? [],
    relationships: diagram?.relationships ?? [],
    enums: diagram?.enums ?? [],
  });

  for (const operation of plan?.operations ?? []) {
    if (operation.target === "table") {
      if (operation.action === "create") {
        next.tables.push(clone(operation.table));
      } else if (operation.action === "delete") {
        next.tables = next.tables.filter((table) => table.id !== operation.id);
        next.relationships = next.relationships.filter(
          (relationship) =>
            relationship.startTableId !== operation.id &&
            relationship.endTableId !== operation.id,
        );
      } else {
        next.tables = next.tables.map((table) =>
          table.id === operation.id
            ? { ...table, ...clone(operation.values) }
            : table,
        );
      }
      continue;
    }

    if (operation.target === "field") {
      next.tables = next.tables.map((table) => {
        if (table.id !== operation.tableId) return table;
        if (operation.action === "create") {
          return {
            ...table,
            fields: [...(table.fields ?? []), clone(operation.field)],
          };
        }
        if (operation.action === "delete") {
          return {
            ...table,
            fields: (table.fields ?? []).filter(
              (field) => field.id !== operation.fieldId,
            ),
          };
        }
        return {
          ...table,
          fields: (table.fields ?? []).map((field) =>
            field.id === operation.fieldId
              ? { ...field, ...clone(operation.values) }
              : field,
          ),
        };
      });
      continue;
    }

    if (operation.target === "relationship") {
      if (operation.action === "create") {
        next.relationships.push(clone(operation.relationship));
      } else if (operation.action === "delete") {
        next.relationships = next.relationships.filter(
          (relationship) => relationship.id !== operation.id,
        );
      } else {
        next.relationships = next.relationships.map((relationship) =>
          relationship.id === operation.id
            ? { ...relationship, ...clone(operation.values) }
            : relationship,
        );
      }
    }
  }

  return next;
}

export { ALLOWED_LAYOUTS };
