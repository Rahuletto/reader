import type { Context } from "hono";
import type { GraphReadOptions, ReadOptions } from "./types";

export interface CachedReadPayload {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
  redirects: string[];
  engine?: string;
}

function applyCacheParams(
  cacheUrl: URL,
  input: ReadOptions | GraphReadOptions,
  mode: "read" | "graph",
): void {
  if (mode === "graph") {
    cacheUrl.searchParams.set("_format", "graph");
  } else {
    cacheUrl.searchParams.set("_format", (input as ReadOptions).format ?? "markdown");
  }
  if (input.selector) cacheUrl.searchParams.set("_selector", input.selector);
  if (input.frontmatter !== undefined)
    cacheUrl.searchParams.set("_frontmatter", String(input.frontmatter));
  if (input.links) cacheUrl.searchParams.set("_links", input.links);
  if (input.images) cacheUrl.searchParams.set("_images", input.images);
  if (input.ua) cacheUrl.searchParams.set("_ua", input.ua);
  if (input.timeout) cacheUrl.searchParams.set("_timeout", String(input.timeout));
  if (input.marker?.length) cacheUrl.searchParams.set("_marker", input.marker.join(","));
  if (input.classify) cacheUrl.searchParams.set("_classify", "1");
  if (input.track) cacheUrl.searchParams.set("_track", "1");
  if (mode === "graph") {
    const g = input as GraphReadOptions;
    if (g.wikidata === false) cacheUrl.searchParams.set("_wikidata", "0");
    if (g.wikidataLimit !== undefined)
      cacheUrl.searchParams.set("_wikidataLimit", String(g.wikidataLimit));
    if (g.wikidataClaims === false) cacheUrl.searchParams.set("_wikidataClaims", "0");
  }
}

export function buildCacheKey(
  requestUrl: string,
  input: ReadOptions | GraphReadOptions,
  mode: "read" | "graph",
): string {
  const cacheUrl = new URL(requestUrl);
  applyCacheParams(cacheUrl, input, mode);
  cacheUrl.searchParams.sort();
  return cacheUrl.toString();
}

export function toCachedPayload(result: {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
  redirects: string[];
  engine?: string;
}): CachedReadPayload {
  const payload: CachedReadPayload = {
    body: result.body,
    contentType: result.contentType,
    finalUrl: result.finalUrl,
    status: result.status,
    redirects: result.redirects,
  };
  if (result.engine) payload.engine = result.engine;
  return payload;
}

export async function getCachedRead(
  kv: KVNamespace,
  cacheKey: string,
): Promise<CachedReadPayload | null> {
  try {
    return await kv.get<CachedReadPayload>(cacheKey, "json");
  } catch {
    return null;
  }
}

export async function putCachedRead(
  c: Context,
  kv: KVNamespace,
  cacheKey: string,
  payload: CachedReadPayload,
): Promise<void> {
  try {
    const putPromise = kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });
    if (c.executionCtx) {
      c.executionCtx.waitUntil(putPromise);
    } else {
      await putPromise;
    }
  } catch {}
}
