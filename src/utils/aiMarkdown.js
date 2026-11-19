function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(value) {
  let html = escapeHtml(value);
  const codeTokens = [];

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `__AI_CODE_${codeTokens.length}__`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  html = html.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  return html.replace(
    /__AI_CODE_(\d+)__/g,
    (token, index) => codeTokens[index] ?? token,
  );
}

function renderList(items, ordered) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`;
}

export function renderAiMarkdown(value) {
  const lines = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(renderList(list.items, list.ordered));
    list = null;
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      if (code) {
        const language = code.language
          ? ` class="language-${escapeHtml(code.language)}"`
          : "";
        blocks.push(
          `<pre><code${language}>${escapeHtml(code.lines.join("\n"))}</code></pre>`,
        );
        code = null;
      } else {
        code = { language: fence[1], lines: [] };
      }
      continue;
    }

    if (code) {
      code.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (code) {
    const language = code.language
      ? ` class="language-${escapeHtml(code.language)}"`
      : "";
    blocks.push(
      `<pre><code${language}>${escapeHtml(code.lines.join("\n"))}</code></pre>`,
    );
  }
  flushParagraph();
  flushList();

  return blocks.join("");
}
