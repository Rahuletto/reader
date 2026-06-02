import type { JsonLdNode } from "./types";
function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function stripDocumentKeys(node: Record<string, unknown>): JsonLdNode {
  const { ["@context"]: _c, ...rest } = node;
  return rest;
}

function collectEmbedded(value: unknown, out: JsonLdNode[], seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEmbedded(item, out, seen);
    return;
  }
  if (!isObject(value)) return;

  if (Array.isArray(value["@graph"])) {
    collectEmbedded(value["@graph"], out, seen);
    return;
  }

  const node = stripDocumentKeys(value);
  const id = node["@id"];
  if (typeof id === "string" && id.length > 0) {
    if (seen.has(id)) return;
    seen.add(id);
  }

  out.push(node);
}

export function embedPageJsonLd(items: unknown[] | undefined, _finalUrl: string): JsonLdNode[] {
  if (!items?.length) return [];
  const out: JsonLdNode[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    collectEmbedded(item, out, seen);
  }
  return out;
}

const MAIN_ENTITY_TYPES = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
  "ScholarlyArticle",
  "Product",
  "SoftwareApplication",
  "WebApplication",
  "FAQPage",
  "HowTo",
  "Recipe",
  "Event",
  "Organization",
  "LocalBusiness",
  "Person",
]);

export function findMainEntityId(nodes: JsonLdNode[]): string | undefined {
  for (const node of nodes) {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    for (const t of types) {
      const name = String(t ?? "")
        .replace(/^https?:\/\/schema\.org\//i, "")
        .replace(/^schema:/i, "");
      if (MAIN_ENTITY_TYPES.has(name) && typeof node["@id"] === "string") {
        return node["@id"];
      }
    }
  }
  return undefined;
}
