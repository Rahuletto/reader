import type { ClassifiedBlock } from "../classifier";
import { blockText } from "../classifier";
import type { JsonLdNode } from "./types";
import { blockId, resolveHref } from "./ids";

const PRICE_RE =
  /(?:\$|€|£|¥)\s?(\d[\d,.]*)(?:\s*(?:\/|per)\s*(mo|month|yr|year|week|wk))?|\b(\d[\d,.]*)\s*(USD|EUR|GBP)/i;
const RATING_RE = /\b(\d(?:\.\d)?)\s*\/\s*5\b|\b(\d(?:\.\d)?)\s*stars?\b/i;

function partRef(id: string): JsonLdNode {
  return { "@id": id };
}

function orderedParts(ids: string[]): JsonLdNode {
  if (ids.length === 0) return { "@list": [] };
  if (ids.length === 1) return { "@list": [partRef(ids[0]!)] };
  return { "@list": ids.map(partRef) };
}

export function blockToSchemaNodes(block: ClassifiedBlock, base: string): JsonLdNode[] {
  const id = blockId(base, block);
  const text = blockText(block);
  const classification = block.classification ?? block.type ?? "paragraph";
  const blockType = block.type ?? "paragraph";

  if (blockType === "image" || classification === "image") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "ImageObject",
    };
    if (typeof block.src === "string") node["contentUrl"] = resolveHref(block.src, base);
    if (block.alt) node["caption"] = block.alt;
    else if (block.text) node["caption"] = block.text;
    return [node];
  }

  if (blockType === "code" || classification === "code") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "SoftwareSourceCode",
      text: typeof block.code === "string" ? block.code : text,
    };
    if (block.language) node["programmingLanguage"] = block.language;
    return [node];
  }

  if (blockType === "list" || classification === "list") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "ItemList",
    };
    if (Array.isArray(block.items)) {
      node["itemListElement"] = block.items.map((item, i) => {
        if (typeof item === "string") {
          return { "@type": "ListItem", position: i + 1, name: item };
        }
        const li = item as ClassifiedBlock;
        const entry: JsonLdNode = {
          "@type": "ListItem",
          position: i + 1,
          name: li.text ?? blockText(li),
        };
        if (li.href) entry["item"] = resolveHref(li.href, base);
        return entry;
      });
    }
    return [node];
  }

  if (blockType === "table" || classification === "table") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "Table",
    };
    if (text) node["description"] = text.slice(0, 500);
    return [node];
  }

  if (classification === "rating" && text) {
    const m = text.match(RATING_RE);
    const node: JsonLdNode = {
      "@id": id,
      "@type": "AggregateRating",
    };
    if (m) {
      node["ratingValue"] = parseFloat(m[1] ?? m[2] ?? "0");
      node["bestRating"] = 5;
    }
    if (text) node["description"] = text.slice(0, 240);
    return [node];
  }

  if (classification === "pricing" && text) {
    const m = text.match(PRICE_RE);
    if (m) {
      const amount = (m[1] ?? m[3] ?? "").replace(/,/g, "");
      const currency = m[4] ?? (text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : "USD");
      return [
        {
          "@id": id,
          "@type": "Offer",
          price: amount,
          priceCurrency: currency,
          description: text.slice(0, 240),
        },
      ];
    }
  }

  if (classification === "product" && text) {
    return [
      {
        "@id": id,
        "@type": "Product",
        name: text.slice(0, 160),
        description: text.slice(0, 500),
      },
    ];
  }

  if (classification === "author" && text) {
    return [
      {
        "@id": id,
        "@type": "Person",
        name: text.slice(0, 120),
      },
    ];
  }

  if (classification === "contact" && text) {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "ContactPoint",
      description: text.slice(0, 240),
    };
    const email = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)?.[0];
    const phone = text.match(/\+?[\d\s().-]{10,}/)?.[0]?.trim();
    if (email) node["email"] = email;
    if (phone) node["telephone"] = phone;
    return [node];
  }

  if (blockType === "link" || classification === "link") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "WebPageElement",
    };
    if (typeof block.href === "string") node["url"] = resolveHref(block.href, base);
    if (block.text) node["name"] = block.text;
    return [node];
  }

  if (blockType === "heading" || classification === "heading") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "WebPageElement",
    };
    const label = block.text ?? text;
    if (label) {
      node["name"] = label;
      node["headline"] = label;
    }
    if (block.level) node["position"] = block.level;
    return [node];
  }

  if (blockType === "blockquote") {
    const node: JsonLdNode = {
      "@id": id,
      "@type": "Quotation",
    };
    if (text) node["text"] = text;
    return [node];
  }

  const node: JsonLdNode = {
    "@id": id,
    "@type": "WebPageElement",
  };
  if (text) node["text"] = text;
  return [node];
}

export function blockPartIds(block: ClassifiedBlock, base: string): string[] {
  return blockToSchemaNodes(block, base).map((n) => String(n["@id"]));
}

export { orderedParts, partRef };
