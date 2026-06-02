import { buildKnowledgeGraph } from "../graph";
import { hasMarkerFilter } from "../marker-filter";
import type { ExtractedPage, GraphReadOptions } from "../types";
import { buildContentTree } from "./json";

export async function toGraphBody(
  page: ExtractedPage,
  opts: GraphReadOptions,
): Promise<{ body: string; contentType: string; wikidataLinked: number }> {
  const { document, wikidataLinked } = await buildKnowledgeGraph(
    page.metadata,
    buildContentTree(page, {
      ...opts,
      classify: opts.classify ?? hasMarkerFilter(opts.marker),
    }),
    {
      wikidata: opts.wikidata !== false,
      ...(opts.wikidataLimit !== undefined ? { wikidataLimit: opts.wikidataLimit } : {}),
      ...(opts.wikidataClaims !== undefined ? { wikidataClaims: opts.wikidataClaims } : {}),
      ...(page.metadata.lang ? { lang: page.metadata.lang.slice(0, 2) } : {}),
    },
  );
  return {
    body: JSON.stringify(document),
    contentType: "application/ld+json; charset=utf-8",
    wikidataLinked,
  };
}
