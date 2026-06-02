import type { WikidataSearchHit } from "./types";

const API = "https://www.wikidata.org/w/api.php";
const UA = "ReaderBot/0.1 (https://github.com/toon-format/toon; knowledge-graph)";

export function entityIri(qid: string): string {
  return `http://www.wikidata.org/entity/${qid}`;
}

export function propertyIri(pid: string): string {
  return `http://www.wikidata.org/prop/direct/${pid}`;
}

async function wikidataApi<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Wikidata API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function searchEntities(
  query: string,
  lang = "en",
  limit = 3,
): Promise<WikidataSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  type SearchResponse = {
    search?: Array<{
      id: string;
      label?: string;
      description?: string;
      display?: { label?: { value?: string }; description?: { value?: string } };
      match?: { type?: string };
    }>;
  };

  const data = await wikidataApi<SearchResponse>({
    action: "wbsearchentities",
    search: trimmed,
    language: lang,
    uselang: lang,
    format: "json",
    formatversion: "2",
    type: "item",
    limit: String(limit),
  });

  const hits: WikidataSearchHit[] = [];
  for (const hit of data.search ?? []) {
    const entry: WikidataSearchHit = {
      id: hit.id,
      matchScore: hit.match?.type === "label" ? 1 : 0.7,
    };
    const label = hit.display?.label?.value ?? hit.label;
    const description = hit.display?.description?.value ?? hit.description;
    if (label) entry.label = label;
    if (description) entry.description = description;
    hits.push(entry);
  }
  return hits;
}

export type WikibaseEntity = {
  id?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<
    string,
    Array<{
      mainsnak?: {
        datavalue?: {
          type?: string;
          value?: unknown;
        };
      };
    }>
  >;
};

export async function getEntities(
  ids: string[],
  lang = "en",
): Promise<Record<string, WikibaseEntity>> {
  if (!ids.length) return {};

  type EntityResponse = { entities?: Record<string, WikibaseEntity> };
  const data = await wikidataApi<EntityResponse>({
    action: "wbgetentities",
    ids: ids.join("|"),
    format: "json",
    props: "labels|descriptions|aliases|claims",
    languages: lang,
    languagefallback: "1",
  });

  return data.entities ?? {};
}

export function parseQidFromIri(iri: string): string | undefined {
  const m = iri.match(/(?:entity\/|wiki\/)(Q\d+)\/?$/i);
  return m?.[1]?.toUpperCase();
}
