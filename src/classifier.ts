export type ClassificationType =
  | "pricing"
  | "date"
  | "author"
  | "contact"
  | "product"
  | "rating"
  | "code"
  | "table"
  | "image"
  | "link"
  | "heading"
  | "list"
  | "paragraph";

export interface ClassifiedBlock {
  type?: string;
  text?: string;
  code?: string;
  language?: string;
  level?: number;
  href?: string;
  alt?: string;
  src?: string;
  ordered?: boolean;
  items?: unknown[];
  headers?: string[];
  rows?: string[][];
  tagName?: string;
  children?: ClassifiedBlock[];
  classification?: ClassificationType;
  marker?: string;
  confidence?: number;
}

const PRICE_RE =
  /(?:\$|€|£|¥)\s?\d[\d,.]*(?:\s*(?:\/|per)\s*(?:mo|month|yr|year|week|wk))?|\b\d[\d,.]*\s*(?:USD|EUR|GBP|\/mo)\b/i;
const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const RATING_RE = /\b\d(?:\.\d)?\s*\/\s*5\b|\b\d(?:\.\d)?\s*stars?\b/i;

export function blockText(block: ClassifiedBlock): string {
  if (typeof block.text === "string") return block.text;
  if (typeof block.code === "string") return block.code;
  if (block.type === "table") {
    const headers = Array.isArray(block.headers) ? (block.headers as string[]).join(" ") : "";
    const rows = Array.isArray(block.rows)
      ? (block.rows as string[][]).map((r) => r.join(" ")).join(" ")
      : "";
    return `${headers} ${rows}`.trim();
  }
  if (block.type === "list" && Array.isArray(block.items)) {
    return (block.items as unknown[])
      .map((item) => (typeof item === "string" ? item : ((item as ClassifiedBlock).text ?? "")))
      .join(" ");
  }
  if (typeof block.href === "string") return `${block.text ?? ""} ${block.href}`;
  if (typeof block.alt === "string") return block.alt;
  return "";
}

function classifyText(
  text: string,
  blockType: string,
): { type: ClassificationType; confidence: number } | null {
  const t = text.trim();
  if (!t) return null;

  if (blockType === "code") return { type: "code", confidence: 1 };
  if (blockType === "table")
    return PRICE_RE.test(t)
      ? { type: "pricing", confidence: 0.7 }
      : { type: "table", confidence: 0.9 };
  if (blockType === "image") return { type: "image", confidence: 1 };
  if (blockType === "link") return { type: "link", confidence: 0.9 };
  if (blockType === "list") return { type: "list", confidence: 0.8 };
  if (blockType === "heading") return { type: "heading", confidence: 1 };

  if (PRICE_RE.test(t)) return { type: "pricing", confidence: 0.85 };
  if (DATE_RE.test(t)) return { type: "date", confidence: 0.8 };
  if (RATING_RE.test(t)) return { type: "rating", confidence: 0.75 };
  if (EMAIL_RE.test(t) || PHONE_RE.test(t)) return { type: "contact", confidence: 0.8 };
  if (/\b(?:author|written by|by)\b/i.test(t) && t.length < 120)
    return { type: "author", confidence: 0.6 };
  if (/\b(?:product|sku|model|add to cart|buy now)\b/i.test(t))
    return { type: "product", confidence: 0.65 };

  return { type: "paragraph", confidence: 0.5 };
}

function classifyFromJsonLd(jsonld: unknown[] | undefined): Map<string, ClassificationType> {
  const hints = new Map<string, ClassificationType>();
  if (!jsonld?.length) return hints;

  for (const item of jsonld) {
    const obj = item as Record<string, unknown>;
    const type = Array.isArray(obj["@type"]) ? obj["@type"][0] : obj["@type"];
    const typeStr = String(type ?? "").toLowerCase();

    if (typeStr.includes("offer") || typeStr.includes("price")) {
      const price =
        obj["price"] ?? (obj["offers"] as Record<string, unknown> | undefined)?.["price"];
      if (price) hints.set(String(price), "pricing");
    }
    if (typeStr.includes("product")) {
      const name = obj["name"];
      if (name) hints.set(String(name), "product");
    }
    if (typeStr.includes("article") || typeStr.includes("newsarticle")) {
      const date = obj["datePublished"] ?? obj["dateModified"];
      if (date) hints.set(String(date), "date");
      const author = obj["author"];
      if (typeof author === "object" && author && "name" in author) {
        hints.set(String((author as { name: string }).name), "author");
      }
    }
  }
  return hints;
}

export function classifyBlocks(
  blocks: ClassifiedBlock[],
  opts?: { jsonld?: unknown[]; author?: string; publishedTime?: string },
): ClassifiedBlock[] {
  const ldHints = classifyFromJsonLd(opts?.jsonld);

  return blocks.map((block) => {
    const text = blockText(block);
    const blockType = String(block.type ?? "paragraph");

    let result = classifyText(text, blockType);

    for (const [hintText, hintType] of ldHints) {
      if (hintText && text.includes(hintText)) {
        result = { type: hintType, confidence: 0.95 };
        break;
      }
    }

    if (opts?.author && text.includes(opts.author)) {
      result = { type: "author", confidence: 0.9 };
    }
    if (opts?.publishedTime && text.includes(opts.publishedTime)) {
      result = { type: "date", confidence: 0.9 };
    }

    if (!result) return block;
    return Object.assign({}, block, {
      classification: result.type,
      confidence: result.confidence,
    });
  });
}

function classifyBlocksDeep(
  blocks: ClassifiedBlock[],
  opts?: Parameters<typeof classifyBlocks>[1],
): ClassifiedBlock[] {
  return classifyBlocks(blocks, opts).map((block) => {
    if (block.type === "group" && Array.isArray(block.children)) {
      return Object.assign({}, block, {
        children: classifyBlocksDeep(block.children as ClassifiedBlock[], opts),
      });
    }
    return block;
  });
}

export function classifyTree(
  tree: unknown[],
  opts?: { jsonld?: unknown[]; author?: string; publishedTime?: string },
): unknown[] {
  return tree.map((section) => {
    const s = section as { content?: ClassifiedBlock[]; children?: unknown[] };
    const next = { ...s };
    if (Array.isArray(s.content)) {
      next.content = classifyBlocksDeep(s.content, opts);
    }
    if (Array.isArray(s.children)) {
      next.children = classifyTree(s.children, opts);
    }
    return next;
  });
}

function flattenBlocks(blocks: ClassifiedBlock[]): ClassifiedBlock[] {
  const out: ClassifiedBlock[] = [];
  for (const block of blocks) {
    if (block.type === "group" && Array.isArray(block.children)) {
      out.push(...flattenBlocks(block.children as ClassifiedBlock[]));
    } else {
      out.push(block);
    }
  }
  return out;
}

export function flattenTree(tree: unknown[]): ClassifiedBlock[] {
  const out: ClassifiedBlock[] = [];
  for (const section of tree) {
    const s = section as { content?: ClassifiedBlock[]; children?: unknown[] };
    if (Array.isArray(s.content)) out.push(...flattenBlocks(s.content));
    if (Array.isArray(s.children)) out.push(...flattenTree(s.children));
  }
  return out;
}
