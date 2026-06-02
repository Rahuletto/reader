import { parseHTML } from "linkedom";
import type { ExtractedPage, ReadOptions } from "../types";
import { metadataRecord } from "../metadata-record";
import { classifyTree } from "../classifier";
import { hasMarkerFilter } from "../marker-filter";
import { assignMarkersTree } from "../markers";
import { makeTurndown } from "./markdown";

function decorateBlock(node: any, block: any): any {
  if (!block || typeof block !== "object" || Array.isArray(block)) return block;
  const id = node.getAttribute("id");
  if (id) block.id = id;
  const cls = node.getAttribute("class");
  if (cls) block.class = cls;
  return block;
}

function nodeToBlock(node: any, td: any): any {
  if (!node) return null;
  if (node.nodeType === 3) {
    const text = node.textContent.trim();
    return text ? { type: "paragraph", text } : null;
  }
  if (node.nodeType !== 1) return null;

  const tagName = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tagName)) {
    const level = parseInt(tagName.slice(1), 10);
    return decorateBlock(node, {
      type: "heading",
      level,
      text: td.turndown(node.innerHTML).trim(),
    });
  }

  if (tagName === "p") {
    const imgChild = node.querySelector("img");
    if (imgChild && node.textContent.trim() === "") {
      const src = imgChild.getAttribute("src") || "";
      const alt = imgChild.getAttribute("alt") || "";
      return decorateBlock(node, { type: "image", src, alt });
    }
    const linkChild = node.querySelector("a");
    if (linkChild && node.textContent.trim() === linkChild.textContent.trim()) {
      const href = linkChild.getAttribute("href") || "";
      const text = linkChild.textContent.trim();
      return decorateBlock(node, { type: "link", href, text });
    }
    const text = td.turndown(node.innerHTML).trim();
    if (text) {
      const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return decorateBlock(node, {
          type: "link",
          href: match[2]!.trim(),
          text: match[1]!.trim(),
        });
      }
      return decorateBlock(node, { type: "paragraph", text });
    }
    return null;
  }

  if (tagName === "a") {
    const href = node.getAttribute("href") || "";
    const text = node.textContent.trim();
    return decorateBlock(node, { type: "link", href, text });
  }

  if (tagName === "blockquote") {
    const text = td.turndown(node.innerHTML).trim();
    return text ? decorateBlock(node, { type: "blockquote", text }) : null;
  }

  if (tagName === "code" || tagName === "pre") {
    const codeText = node.textContent.trim();
    let language = "";
    const classAttr = node.getAttribute("class") || "";
    const match = classAttr.match(/language-(\w+)/);
    if (match) language = match[1];
    return decorateBlock(node, {
      type: "code",
      language,
      code: codeText,
    });
  }

  if (tagName === "img") {
    const src = node.getAttribute("src") || "";
    const alt = node.getAttribute("alt") || "";
    return decorateBlock(node, { type: "image", src, alt });
  }

  if (tagName === "ul" || tagName === "ol") {
    const items = Array.from(node.querySelectorAll("li") as any[])
      .filter((li) => li.closest("ul, ol") === node)
      .map((li) => {
        const text = td.turndown(li.innerHTML).trim();
        const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (match) {
          return {
            type: "link",
            href: match[2]!.trim(),
            text: match[1]!.trim(),
          };
        }
        return text;
      });
    return decorateBlock(node, {
      type: "list",
      ordered: tagName === "ol",
      items,
    });
  }

  if (tagName === "table") {
    const rows = Array.from(node.querySelectorAll("tr") as any[]).filter(
      (row: any) => row.closest("table") === node,
    );
    let headers: string[] = [];
    const bodyRows: string[][] = [];
    rows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll("th, td") as any[]).filter(
        (cell: any) => cell.closest("tr") === row,
      );
      const cellTexts = cells.map((cell) => td.turndown(cell.innerHTML).trim());
      if (idx === 0 && row.querySelector("th")) {
        headers = cellTexts;
      } else {
        bodyRows.push(cellTexts);
      }
    });
    return decorateBlock(node, {
      type: "table",
      headers,
      rows: bodyRows,
    });
  }

  const children = Array.from(node.childNodes);
  const hasBlockChildren = children.some(
    (child: any) =>
      child.nodeType === 1 &&
      /^(p|h[1-6]|ul|ol|table|blockquote|pre|div|section|article|main|header|footer|aside|nav|details|summary)$/i.test(
        child.tagName,
      ),
  );

  if (hasBlockChildren) {
    const childBlocks: any[] = [];
    for (const child of children) {
      const block = nodeToBlock(child, td);
      if (block) {
        if (Array.isArray(block)) {
          childBlocks.push(...block);
        } else {
          childBlocks.push(block);
        }
      }
    }
    if (childBlocks.length > 0) {
      return decorateBlock(node, {
        type: "group",
        tagName,
        children: childBlocks,
      });
    }
    return null;
  } else {
    const imgChild = node.querySelector("img");
    if (imgChild && node.textContent.trim() === "") {
      const src = imgChild.getAttribute("src") || "";
      const alt = imgChild.getAttribute("alt") || "";
      return decorateBlock(node, { type: "image", src, alt });
    }
    const linkChild = node.querySelector("a");
    if (linkChild && node.textContent.trim() === linkChild.textContent.trim()) {
      const href = linkChild.getAttribute("href") || "";
      const text = linkChild.textContent.trim();
      return decorateBlock(node, { type: "link", href, text });
    }
    const text = td.turndown(node.innerHTML).trim();
    if (text && !/^(script|style)$/i.test(tagName)) {
      const match = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return decorateBlock(node, {
          type: "link",
          href: match[2]!.trim(),
          text: match[1]!.trim(),
        });
      }
      return decorateBlock(node, { type: "paragraph", text });
    }
    return null;
  }
}

function parseHtmlToBlocks(html: string, td: any): any[] {
  const needsWrap = !/<html|<body/i.test(html);
  const parsedHtml = needsWrap ? `<html><body>${html}</body></html>` : html;
  const { document } = parseHTML(parsedHtml);
  const root = document.body || document.documentElement;
  if (!root) return [];
  const blocks: any[] = [];
  for (const child of Array.from(root.childNodes)) {
    const block = nodeToBlock(child, td);
    if (block) {
      if (Array.isArray(block)) {
        blocks.push(...block);
      } else {
        blocks.push(block);
      }
    }
  }
  return blocks.filter((b) => b !== undefined && b !== null);
}

function parseMarkdownToBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  const lines = markdown.split("\n");

  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  let currentListItems: any[] = [];
  let currentListOrdered = false;

  function flushList() {
    if (currentListItems.length > 0) {
      blocks.push({
        type: "list",
        ordered: currentListOrdered,
        items: [...currentListItems],
      });
      currentListItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        blocks.push({
          type: "code",
          language: codeLang,
          code: codeLines.join("\n"),
        });
        inCodeBlock = false;
        codeLines = [];
        codeLang = "";
      } else {
        flushList();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2]!.trim(),
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushList();
      blocks.push({
        type: "blockquote",
        text: trimmed.slice(1).trim(),
      });
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      flushList();
      blocks.push({
        type: "image",
        src: imageMatch[2]!.trim(),
        alt: imageMatch[1]!.trim(),
      });
      continue;
    }

    const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      flushList();
      blocks.push({
        type: "link",
        href: linkMatch[2]!.trim(),
        text: linkMatch[1]!.trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (unorderedMatch) {
      if (currentListItems.length > 0 && currentListOrdered) {
        flushList();
      }
      currentListOrdered = false;
      const itemText = unorderedMatch[2]!.trim();
      const match = itemText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        currentListItems.push({
          type: "link",
          href: match[2]!.trim(),
          text: match[1]!.trim(),
        });
      } else {
        currentListItems.push(itemText);
      }
      continue;
    } else if (orderedMatch) {
      if (currentListItems.length > 0 && !currentListOrdered) {
        flushList();
      }
      currentListOrdered = true;
      const itemText = orderedMatch[2]!.trim();
      const match = itemText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        currentListItems.push({
          type: "link",
          href: match[2]!.trim(),
          text: match[1]!.trim(),
        });
      } else {
        currentListItems.push(itemText);
      }
      continue;
    }

    flushList();
    blocks.push({
      type: "paragraph",
      text: trimmed,
    });
  }

  flushList();
  return blocks;
}

function blocksToTree(blocks: any[]): any[] {
  const root: any[] = [];
  const stack: any[] = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      const section: any = {
        heading: block.text,
        level: block.level,
        content: [],
        children: [],
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) {
        stack.pop();
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(section);
      } else {
        root.push(section);
      }

      stack.push(section);
    } else {
      if (stack.length > 0) {
        stack[stack.length - 1].content.push(block);
      } else {
        let nullSection =
          root.length > 0 && root[root.length - 1].heading === null ? root[root.length - 1] : null;
        if (!nullSection) {
          nullSection = { heading: null, level: 0, content: [], children: [] };
          root.push(nullSection);
        }
        nullSection.content.push(block);
      }
    }
  }

  return root;
}

function shouldClassify(opts: ReadOptions): boolean {
  return opts.classify === true || hasMarkerFilter(opts.marker);
}

function enrichTree(tree: unknown[], page: ExtractedPage, opts: ReadOptions): unknown[] {
  if (!shouldClassify(opts)) return tree;
  let enriched = classifyTree(tree, {
    ...(page.metadata.jsonld ? { jsonld: page.metadata.jsonld } : {}),
    ...(page.metadata.author ? { author: page.metadata.author } : {}),
    ...(page.metadata.publishedTime ? { publishedTime: page.metadata.publishedTime } : {}),
  });
  if (hasMarkerFilter(opts.marker)) {
    enriched = assignMarkersTree(enriched, opts.marker!);
  }
  return enriched;
}

export function buildContentTree(page: ExtractedPage, opts: ReadOptions): unknown[] {
  if ((page as any).isJinaMarkdownFallback) {
    const blocks = parseMarkdownToBlocks(page.html);
    return enrichTree(blocksToTree(blocks), page, opts);
  }
  const td = makeTurndown(opts, page.metadata.finalUrl);
  const blocks = parseHtmlToBlocks(page.html, td);
  return enrichTree(blocksToTree(blocks), page, opts);
}

export function toJson(page: ExtractedPage, opts: ReadOptions): unknown {
  return {
    metadata: metadataRecord(page.metadata),
    content: buildContentTree(page, opts),
  };
}
