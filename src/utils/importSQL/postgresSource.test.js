import test from "node:test";
import assert from "node:assert/strict";
import { Parser } from "node-sql-parser";
import { DB } from "../../data/constants.js";
import { importSQL } from "./index.js";
import { preparePostgresImportSource } from "./postgresSource.js";

test("PostgreSQL pg_dump input is reduced to diagram DDL", () => {
  const source = `
    CREATE FUNCTION public.helper() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;

    CREATE TABLE public_users (
      id TEXT PRIMARY KEY,
      labels TEXT[] NOT NULL,
      embedding public.vector(3),
      generated_value INTEGER GENERATED ALWAYS AS (char_length(id)) STORED,
      CONSTRAINT users_check CHECK (id <> '')
    );
    CREATE TABLE public_orders (id TEXT PRIMARY KEY, user_id TEXT);
    ALTER TABLE ONLY public_orders
      ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id)
      REFERENCES public_users(id) DEFERRABLE INITIALLY DEFERRED;
  `;

  const prepared = preparePostgresImportSource(source);
  assert.doesNotMatch(prepared, /CREATE FUNCTION|CHECK|DEFERRABLE|VECTOR/i);

  const ast = new Parser().astify(prepared, { database: "Postgresql" });
  const diagram = importSQL(ast, DB.POSTGRES, DB.POSTGRES);

  assert.equal(diagram.tables.length, 2);
  assert.equal(diagram.relationships.length, 1);
  assert.equal(diagram.tables[0].name, "public_users");
  assert.equal(diagram.tables[0].fields[1].type, "TEXT");
});

test("ordinary PostgreSQL DDL is kept unchanged", () => {
  const source = "CREATE TABLE users (id TEXT PRIMARY KEY);";
  assert.equal(preparePostgresImportSource(source), source);
});
