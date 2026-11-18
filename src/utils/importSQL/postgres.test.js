import test from "node:test";
import assert from "node:assert/strict";
import { Parser } from "node-sql-parser";
import { DB } from "../../data/constants.js";
import { importSQL } from "./index.js";

test("PostgreSQL import keeps working with expression defaults", () => {
  const ast = new Parser().astify(
    `CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      lease_until TIMESTAMP WITH TIME ZONE DEFAULT (now() + '00:01:00'::interval)
    );`,
    { database: "Postgresql" },
  );

  let diagram;
  assert.doesNotThrow(() => {
    diagram = importSQL(ast, DB.POSTGRES, DB.POSTGRES);
  });
  const [table] = diagram.tables;
  assert.equal(table.fields[1].default, "");
});

test("PostgreSQL import falls back for unknown column types", () => {
  const ast = {
    type: "create",
    keyword: "table",
    table: [{ table: "events" }],
    create_definitions: [
      {
        resource: "column",
        column: { column: { expr: { value: "transaction_id" } } },
        definition: { dataType: "XID8" },
      },
    ],
  };

  const [table] = importSQL(ast, DB.POSTGRES, DB.POSTGRES).tables;
  assert.equal(table.fields[0].type, "BLOB");
});
