import type { JsonLdNode } from "../jsonld/types";
import { entityIri, getEntities, parseQidFromIri, searchEntities } from "./api";
import { entityToJsonLd } from "./serialize";
import type { EntityLink, LinkCandidate, WikidataLinkOptions } from "./types";

const LINKABLE_TYPES = new Set([
  "Person",
  "Organization",
  "Product",
  "Place",
  "LocalBusiness",
  "Corporation",
  "Brand",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Event",
  "CreativeWork",
]);

function nodeTypes(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (!t) return [];
  const raw = Array.isArray(t) ? t : [t];
  return raw.map((x) => {
    if (typeof x === "string")
      return x.replace(/^schema:/i, "").replace(/^https?:\/\/schema\.org\//i, "");
    if (typeof x === "object" && x !== null && "@id" in x) return "Thing";
    return String(x);
  });
}

function nodeLabel(node: JsonLdNode): string | undefined {
  for (const key of ["name", "headline", "skos:prefLabel", "rdfs:label"]) {
    const v = node[key];
    if (typeof v === "string" && v.trim().length >= 2) return v.trim();
  }
  const text = node["text"];
  if (typeof text === "string" && text.length >= 3 && text.length <= 120) return text.trim();
  return undefined;
}

export function extractLinkCandidates(nodes: JsonLdNode[]): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const localId = node["@id"];
    if (typeof localId !== "string" || localId.includes("wikidata.org/entity/")) continue;

    const types = nodeTypes(node);
    const label = nodeLabel(node);
    if (!label) continue;

    const linkable = types.some((t) => LINKABLE_TYPES.has(t));
    if (!linkable && types.length > 0 && !types.includes("WebPageElement")) continue;

    let existingQid: string | undefined;
    const sameAs = node["sameAs"];
    const sameList = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
    for (const item of sameList) {
      const iri =
        typeof item === "string" ? item : String((item as { "@id"?: string })["@id"] ?? "");
      const qid = parseQidFromIri(iri);
      if (qid) {
        existingQid = qid;
        break;
      }
    }

    const key = `${localId}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ localId, label, types, ...(existingQid ? { existingQid } : {}) });
  }

  return out;
}

function normalizeLabel(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

async function resolveCandidate(
  candidate: LinkCandidate,
  lang: string,
): Promise<EntityLink | undefined> {
  if (candidate.existingQid) {
    return {
      localId: candidate.localId,
      qid: candidate.existingQid,
      confidence: "exact",
    };
  }

  const hits = await searchEntities(candidate.label, lang, 3);
  if (!hits.length) return undefined;

  const top = hits[0]!;
  const label = top.label ?? candidate.label;
  const exact = normalizeLabel(candidate.label, label);
  const high = top.matchScore !== undefined && top.matchScore >= 0.9;

  if (!exact && !high) return undefined;

  return {
    localId: candidate.localId,
    qid: top.id,
    label,
    confidence: exact ? "exact" : "high",
  };
}

export async function enrichWithWikidata(
  nodes: JsonLdNode[],
  options: WikidataLinkOptions = {},
): Promise<{ nodes: JsonLdNode[]; linked: EntityLink[] }> {
  if (options.enabled === false) return { nodes, linked: [] };

  const lang = options.lang ?? "en";
  const limit = Math.min(options.limit ?? 8, 15);
  const candidates = extractLinkCandidates(nodes).slice(0, limit);

  const linked: EntityLink[] = [];
  const qids = new Set<string>();

  const resolved = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return await resolveCandidate(candidate, lang);
      } catch {
        return undefined;
      }
    }),
  );
  for (const link of resolved) {
    if (!link) continue;
    linked.push(link);
    qids.add(link.qid);
  }

  const byLocalId = new Map(linked.map((l) => [l.localId, l]));

  const enriched = nodes.map((node) => {
    const id = node["@id"];
    if (typeof id !== "string") return node;
    const link = byLocalId.get(id);
    if (!link) return node;

    const sameAs = entityIri(link.qid);
    const prev = node["sameAs"];
    const list = Array.isArray(prev) ? [...prev] : prev ? [prev] : [];
    if (!list.includes(sameAs)) list.push(sameAs);

    return {
      ...node,
      sameAs: list.length === 1 ? list[0] : list,
      ...(link.label && !node["name"] ? { name: link.label } : {}),
    };
  });

  if (!options.claims || qids.size === 0) {
    return { nodes: enriched, linked };
  }

  try {
    const entities = await getEntities([...qids], lang);
    const wdNodes: JsonLdNode[] = [];
    for (const [qid, entity] of Object.entries(entities)) {
      if (entity.id === "-1") continue;
      wdNodes.push(entityToJsonLd(qid, entity, lang, options.maxClaimsPerEntity ?? 3));
    }
    return { nodes: dedupeWd(enriched, wdNodes), linked };
  } catch {
    return { nodes: enriched, linked };
  }
}

function dedupeWd(local: JsonLdNode[], wd: JsonLdNode[]): JsonLdNode[] {
  const ids = new Set(local.map((n) => n["@id"]).filter((x) => typeof x === "string"));
  const extra = wd.filter((n) => {
    const id = n["@id"];
    return typeof id === "string" && !ids.has(id);
  });
  return [...local, ...extra];
}
