import type { PageMetadata } from "./types";
import { JSON_LD_CONTEXT } from "./jsonld/context";
import { embedPageJsonLd, findMainEntityId } from "./jsonld/embed";
import { documentBase, personId, webpageId } from "./jsonld/ids";
import { orderedParts, partRef } from "./jsonld/block";
import { buildContentNodes } from "./jsonld/section";
import type { GraphBuildOptions, JsonLdDocument, JsonLdNode } from "./jsonld/types";
import { enrichWithWikidata } from "./wikidata/link";

export type { JsonLdDocument, JsonLdNode, GraphBuildOptions };

export async function buildKnowledgeGraph(
  metadata: PageMetadata,
  contentTree: unknown[],
  options: GraphBuildOptions = {},
): Promise<{ document: JsonLdDocument; wikidataLinked: number }> {
  const base = documentBase(metadata.finalUrl || metadata.url);
  const wpId = webpageId(base);
  const lang = options.lang ?? metadata.lang?.slice(0, 2) ?? "en";

  const webpage: JsonLdNode = {
    "@id": wpId,
    "@type": "WebPage",
    url: metadata.finalUrl,
  };

  if (metadata.title) webpage["name"] = metadata.title;
  if (metadata.description) webpage["description"] = metadata.description;
  if (metadata.lang) webpage["inLanguage"] = metadata.lang;
  if (metadata.publishedTime) webpage["datePublished"] = metadata.publishedTime;
  if (metadata.modifiedTime) webpage["dateModified"] = metadata.modifiedTime;
  if (metadata.image) webpage["image"] = metadata.image;
  if (metadata.canonical) webpage["isBasedOn"] = metadata.canonical;

  if (metadata.siteName) {
    webpage["publisher"] = {
      "@type": "Organization",
      name: metadata.siteName,
    };
  }

  const authorName = metadata.author ?? metadata.byline;
  if (authorName) {
    webpage["author"] = partRef(personId(base, authorName));
  }

  const embedded = embedPageJsonLd(metadata.jsonld, metadata.finalUrl);
  const mainEntityId = findMainEntityId(embedded);
  if (mainEntityId) {
    webpage["mainEntity"] = partRef(mainEntityId);
  }

  const { nodes: contentNodes, topSectionIds } = buildContentNodes(contentTree, base, wpId);
  if (topSectionIds.length > 0) {
    webpage["hasPart"] = orderedParts(topSectionIds);
  }

  let graph: JsonLdNode[] = [webpage, ...contentNodes, ...embedded];

  if (authorName) {
    graph.push({
      "@id": personId(base, authorName),
      "@type": "Person",
      name: authorName,
    });
  }

  graph = dedupeById(graph);

  const wikidataEnabled = options.wikidata !== false;
  const { nodes: enriched, linked } = await enrichWithWikidata(graph, {
    enabled: wikidataEnabled,
    limit: options.wikidataLimit ?? 8,
    lang,
    claims: options.wikidataClaims !== false,
    maxClaimsPerEntity: 3,
  });

  return {
    document: {
      "@context": JSON_LD_CONTEXT,
      "@graph": dedupeById(enriched),
    },
    wikidataLinked: linked.length,
  };
}

function dedupeById(nodes: JsonLdNode[]): JsonLdNode[] {
  const byId = new Map<string, JsonLdNode>();
  for (const node of nodes) {
    const rawId = node["@id"];
    if (typeof rawId !== "string") {
      byId.set(`_:anon${byId.size}`, node);
      continue;
    }
    const prev = byId.get(rawId);
    if (!prev) {
      byId.set(rawId, node);
      continue;
    }
    byId.set(rawId, mergeNode(prev, node));
  }
  return [...byId.values()];
}

function mergeNode(a: JsonLdNode, b: JsonLdNode): JsonLdNode {
  const out: JsonLdNode = { ...a };
  for (const [key, val] of Object.entries(b)) {
    if (key === "@id") continue;
    if (out[key] === undefined) {
      out[key] = val;
    }
  }
  return out;
}
