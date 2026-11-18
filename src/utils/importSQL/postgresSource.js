const PG_DUMP_MARKERS =
  /(^|\n)\s*(?:CREATE\s+(?:SCHEMA|EXTENSION|FUNCTION|PROCEDURE|VIEW|SEQUENCE|TRIGGER|POLICY)|ALTER\s+SEQUENCE|GRANT\s|REVOKE\s|SET\s)/im;

const STATEMENT_START =
  /^\s*(?:CREATE\s+(?:(?:UNLOGGED|TEMPORARY)\s+)?TABLE|ALTER\s+TABLE|CREATE\s+TYPE)\b/gim;

function dollarQuoteAt(source, index) {
  const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match?.[0] ?? null;
}

function findStatementEnd(source, start) {
  let depth = 0;
  let quote = null;
  let dollarQuote = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }

    if (quote) {
      if (character !== quote) continue;
      if (nextCharacter === quote) {
        index += 1;
        continue;
      }
      quote = null;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "$") {
      dollarQuote = dollarQuoteAt(source, index);
      if (dollarQuote) index += dollarQuote.length - 1;
      continue;
    }

    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === ";" && depth === 0) return index + 1;
  }

  return source.length;
}

function findClosingParenthesis(source, openIndex) {
  let depth = 0;
  let quote = null;
  let dollarQuote = null;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }

    if (quote) {
      if (character !== quote) continue;
      if (nextCharacter === quote) {
        index += 1;
        continue;
      }
      quote = null;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "$") {
      dollarQuote = dollarQuoteAt(source, index);
      if (dollarQuote) index += dollarQuote.length - 1;
      continue;
    }

    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitDefinitions(body) {
  const definitions = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let dollarQuote = null;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    const nextCharacter = body[index + 1];

    if (dollarQuote) {
      if (body.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }

    if (quote) {
      if (character !== quote) continue;
      if (nextCharacter === quote) {
        index += 1;
        continue;
      }
      quote = null;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "$") {
      dollarQuote = dollarQuoteAt(body, index);
      if (dollarQuote) index += dollarQuote.length - 1;
      continue;
    }

    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      definitions.push(body.slice(start, index));
      start = index + 1;
    }
  }

  definitions.push(body.slice(start));
  return definitions;
}

function removeGeneratedClause(definition) {
  const match = /\bGENERATED\s+ALWAYS\s+AS\s*\(/gi.exec(definition);
  if (!match) return definition;

  const openIndex = match.index + match[0].lastIndexOf("(");
  const closeIndex = findClosingParenthesis(definition, openIndex);
  if (closeIndex < 0) return definition;

  const stored = /\s+STORED\b/iy;
  stored.lastIndex = closeIndex + 1;
  const storedMatch = stored.exec(definition);
  const endIndex = storedMatch
    ? stored.lastIndex
    : closeIndex + 1;
  return `${definition.slice(0, match.index)}${definition.slice(endIndex)}`;
}

function normalizeTable(statement) {
  const openIndex = statement.indexOf("(");
  if (openIndex < 0) return statement;
  const closeIndex = findClosingParenthesis(statement, openIndex);
  if (closeIndex < 0) return statement;

  const definitions = splitDefinitions(
    statement.slice(openIndex + 1, closeIndex),
  )
    .filter(
      (definition) =>
        !/^\s*CONSTRAINT\b[\s\S]*\bCHECK\s*\(/i.test(definition),
    )
    .map(removeGeneratedClause)
    .map((definition) =>
      definition
        .replace(/\b(?:public\.)?vector\s*\([^)]*\)/gi, "double precision")
        .replace(/\b(?:text|character varying)\[\]/gi, "text")
        .replace(/\bxid8\b/gi, "bigint"),
    );

  return `${statement.slice(0, openIndex + 1)}${definitions.join(",")}${statement.slice(closeIndex)}`;
}

function rewriteQualifiedIdentifiers(source) {
  let result = "";
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (quote) {
      result += character;
      if (character === quote) {
        if (nextCharacter === quote) {
          result += nextCharacter;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      result += character;
      continue;
    }

    const match = source
      .slice(index)
      .match(/^([A-Za-z_][A-Za-z0-9_$]*)\.([A-Za-z_][A-Za-z0-9_$]*)\b/);
    if (match) {
      result += `${match[1]}_${match[2]}`;
      index += match[0].length - 1;
    } else {
      result += character;
    }
  }

  return result;
}

function extractSupportedStatements(source) {
  const statements = [];
  for (const match of source.matchAll(STATEMENT_START)) {
    const start = match.index;
    const statement = source.slice(start, findStatementEnd(source, start));
    if (
      /^\s*ALTER\s+TABLE\b/i.test(statement) &&
      !/\bADD\s+CONSTRAINT\b/i.test(statement)
    ) {
      continue;
    }

    let normalized = /^\s*CREATE\s+TABLE\b/i.test(statement)
      ? normalizeTable(statement)
      : statement;
    normalized = normalized.replace(
      /\s+DEFERRABLE(?:\s+INITIALLY\s+\w+)?/gi,
      "",
    );
    statements.push(rewriteQualifiedIdentifiers(normalized));
  }
  return statements;
}

export function preparePostgresImportSource(source) {
  if (!PG_DUMP_MARKERS.test(source)) return source;
  return extractSupportedStatements(source).join("\n");
}
