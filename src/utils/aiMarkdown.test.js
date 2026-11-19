import test from "node:test";
import assert from "node:assert/strict";
import { renderAiMarkdown } from "./aiMarkdown.js";

test("AI markdown becomes readable rich text", () => {
  const html = renderAiMarkdown("## 知识库\n\n**表数量：** 117\n\n- resources");

  assert.match(html, /<h2[^>]*>知识库<\/h2>/);
  assert.match(html, /<strong>表数量：<\/strong>/);
  assert.match(html, /<li>resources<\/li>/);
});

test("AI markdown keeps code blocks intact", () => {
  const html = renderAiMarkdown("```sql\nselect 1;\n```");

  assert.match(html, /<pre>[\s\S]*<code[^>]*>select 1;<\/code>[\s\S]*<\/pre>/);
});

test("AI markdown escapes raw HTML", () => {
  const html = renderAiMarkdown('<img src="x" onerror="alert(1)">');

  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
