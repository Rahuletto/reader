import { parseHTML } from "linkedom";

interface Reconstructed {
  html: string;
  textContent: string;
  title?: string;
  description?: string;
}

interface Candidate {
  text: string;
  score: number;
  type: "html" | "markdown" | "text";
}

const COMMON_CONTENT_KEYS = new Set([
  "rawMarkdownBody",
  "markdownRemark",
  "mdx",
  "html",
  "markdown",
  "body",
  "content",
  "textContent",
  "text",
  "rawBody",
  "rawContent",
  "description",
  "excerpt",
]);

function scoreString(str: string): { type: "html" | "markdown" | "text"; score: number } {
  const len = str.length;
  if (len < 50) return { type: "text", score: 0 };

  const htmlTagCount = (str.match(/<[a-zA-Z1-6]+[^>]*>/g) || []).length;
  const closingTagCount = (str.match(/<\/[a-zA-Z1-6]+>/g) || []).length;
  if (htmlTagCount > 2 && closingTagCount > 2) {
    return { type: "html", score: len + htmlTagCount * 10 };
  }

  const markdownHeaderCount = (str.match(/^#{1,6}\s+\S+/gm) || []).length;
  const markdownLinkCount = (str.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  const markdownBoldCount = (str.match(/\*\*[^*]+\*\*/g) || []).length;
  const markdownListCount = (str.match(/^\s*[-*+]\s+/gm) || []).length;
  const mdScore =
    markdownHeaderCount * 30 +
    markdownLinkCount * 20 +
    markdownBoldCount * 10 +
    markdownListCount * 15;
  if (mdScore > 10) {
    return { type: "markdown", score: len + mdScore };
  }

  const wordCount = (str.match(/\s+/g) || []).length;
  if (wordCount > 5) {
    return { type: "text", score: len };
  }

  return { type: "text", score: 0 };
}

function isPortableText(obj: any): boolean {
  if (!Array.isArray(obj)) return false;
  return obj.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item["_type"] === "block" ||
        item.type === "block" ||
        (Array.isArray(item.children) &&
          item.children.some((c: any) => c && typeof c.text === "string"))),
  );
}

function renderPortableText(blocks: any[]): string {
  let html = "";
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const children = block.children || block.spans || [];
    if (!Array.isArray(children)) continue;

    let textContent = "";
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      let text = child.text || "";
      if (child.marks && Array.isArray(child.marks)) {
        if (child.marks.includes("strong") || child.marks.includes("bold")) {
          text = `<strong>${text}</strong>`;
        }
        if (child.marks.includes("em") || child.marks.includes("italic")) {
          text = `<em>${text}</em>`;
        }
        if (child.marks.includes("code")) {
          text = `<code>${text}</code>`;
        }
      }
      textContent += text;
    }

    const style = block.style || block.type || "normal";
    if (style === "h1") html += `<h1>${textContent}</h1>\n`;
    else if (style === "h2") html += `<h2>${textContent}</h2>\n`;
    else if (style === "h3") html += `<h3>${textContent}</h3>\n`;
    else if (style === "h4") html += `<h4>${textContent}</h4>\n`;
    else if (style === "blockquote") html += `<blockquote>${textContent}</blockquote>\n`;
    else html += `<p>${textContent}</p>\n`;
  }
  return html;
}

function renderEditorJS(blocks: any[]): string {
  let html = "";
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const type = block.type;
    const data = block.data;
    if (!type || !data || typeof data !== "object") continue;

    if (type === "paragraph" && typeof data.text === "string") {
      html += `<p>${data.text}</p>\n`;
    } else if (type === "header" && typeof data.text === "string") {
      const lvl = data.level || 2;
      html += `<h${lvl}>${data.text}</h${lvl}>\n`;
    } else if (type === "list" && Array.isArray(data.items)) {
      const listTag = data.style === "ordered" ? "ol" : "ul";
      html += `<${listTag}>\n`;
      for (const item of data.items) {
        if (typeof item === "string") {
          html += `  <li>${item}</li>\n`;
        }
      }
      html += `</${listTag}>\n`;
    } else if (type === "image" && data.file && typeof data.file.url === "string") {
      const caption = data.caption || "";
      html += `<img src="${data.file.url}" alt="${caption}" />\n`;
    }
  }
  return html;
}

function traverse(obj: any, candidates: Candidate[]) {
  if (obj === null || obj === undefined) return;

  if (typeof obj === "string") {
    const res = scoreString(obj);
    if (res.score > 0) {
      candidates.push({ text: obj, score: res.score, type: res.type });
    }
    return;
  }

  if (Array.isArray(obj)) {
    if (isPortableText(obj)) {
      const rendered = renderPortableText(obj);
      candidates.push({ text: rendered, score: rendered.length + 500, type: "html" });
      return;
    }
    for (const val of obj) {
      traverse(val, candidates);
    }
    return;
  }

  if (typeof obj === "object") {
    if (obj.blocks && Array.isArray(obj.blocks)) {
      const rendered = renderEditorJS(obj.blocks);
      candidates.push({ text: rendered, score: rendered.length + 500, type: "html" });
    }
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string") {
        const res = scoreString(val);
        if (res.score > 0) {
          const bonus = COMMON_CONTENT_KEYS.has(key) ? 1000 : 0;
          candidates.push({ text: val, score: res.score + bonus, type: res.type });
        }
      } else {
        traverse(val, candidates);
      }
    }
  }
}

export function reconstructFromJSON(json: any): Reconstructed | null {
  const candidates: Candidate[] = [];
  traverse(json, candidates);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;

  if (best.type === "html") {
    try {
      const spacedText = best.text
        .replace(/<\/span>\s*<span/gi, "</span> <span")
        .replace(/<\/div>\s*<div/gi, "</div> <div")
        .replace(/<\/span>\s*<div/gi, "</span> <div")
        .replace(/<\/div>\s*<span/gi, "</div> <span")
        .replace(/<\/h([1-6])>\s*<h([1-6])/gi, "</h$1> <h$2>")
        .replace(/<\/a>\s*<a/gi, "</a> <a");
      const { document } = parseHTML(spacedText);
      const title = document.querySelector("title")?.textContent || "";
      return {
        html: spacedText,
        textContent:
          document.body?.textContent ||
          document.documentElement?.textContent ||
          spacedText.replace(/<[^>]+>/g, ""),
        ...(title ? { title } : {}),
      };
    } catch {}
    return {
      html: best.text,
      textContent: best.text.replace(/<[^>]+>/g, ""),
    };
  }

  if (best.type === "markdown") {
    return {
      html: best.text,
      textContent: best.text,
    };
  }

  return {
    html: `<p>${best.text}</p>`,
    textContent: best.text,
  };
}
