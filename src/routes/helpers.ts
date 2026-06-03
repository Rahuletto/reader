import type { Context } from "hono";
import { read, ReaderFetchError } from "../reader";
import { toGraphBody } from "../formatters/graph";
import { makeSnapshot, saveSnapshot } from "../snapshot";
import { buildCacheKey, getCachedRead, putCachedRead, toCachedPayload } from "../kv-cache";
import { type Format, type GraphReadOptions, type ReadOptions } from "../types";

export function negotiateFormat(explicit?: Format): Format {
  return explicit ?? "markdown";
}

export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^https?:\/[^/]/i.test(s)) {
      s = s.replace(/^https?:\//i, (m) => m + "/");
    } else {
      s = "https://" + s;
    }
  }
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

export function headerOverrides(c: Context): Partial<ReadOptions> {
  const out: Partial<ReadOptions> = {};
  const sel = c.req.header("x-selector");
  if (sel) out.selector = sel;
  const ua = c.req.header("x-user-agent");
  if (ua) out.ua = ua;
  return out;
}

export function buildResponse(
  c: Context,
  body: string,
  contentType: string,
  status: number,
  finalUrl: string,
  redirects: string[],
  engine?: string,
  outputFormat?: string,
) {
  c.header("Content-Type", contentType);
  c.header("X-Final-URL", finalUrl);
  c.header("X-Upstream-Status", String(status));
  c.header("X-Redirect-History", JSON.stringify(redirects));
  if (engine) {
    c.header("X-Engine", engine);
  }
  if (outputFormat) {
    c.header("X-Output-Format", outputFormat);
  }
  const exposed = ["X-Final-URL", "X-Upstream-Status", "X-Redirect-History"];
  if (engine) exposed.push("X-Engine");
  if (outputFormat) exposed.push("X-Output-Format");
  c.header("Access-Control-Expose-Headers", exposed.join(", "));
  return c.body(body, 200);
}

export async function handleGraph(c: Context, input: GraphReadOptions, env: CloudflareBindings) {
  const method = c.req.method.toUpperCase();
  const useCache = method === "GET" && input.cache !== "bypass";
  const kv = env.CACHE;

  let cacheKey: string | null = null;
  if (useCache && kv) {
    cacheKey = buildCacheKey(c.req.url, input, "graph");
    const cached = await getCachedRead(kv, cacheKey);
    if (cached) {
      const response = buildResponse(
        c,
        cached.body,
        cached.contentType,
        cached.status,
        cached.finalUrl,
        cached.redirects,
        cached.engine,
        "graph",
      );
      response.headers.set("X-Cache", "HIT");
      return response;
    }
  }

  try {
    const result = await read({ ...input, format: "text", env });
    if (!result.page) {
      return c.json(
        { error: "graph_unavailable", message: "Could not extract page for graph." },
        400,
      );
    }
    const { body, contentType, wikidataLinked } = await toGraphBody(result.page, input);
    const response = buildResponse(
      c,
      body,
      contentType,
      result.status,
      result.finalUrl,
      result.redirects,
      result.engine,
      "graph",
    );
    if (wikidataLinked > 0) {
      response.headers.set("X-Wikidata-Linked", String(wikidataLinked));
      const exposed = response.headers.get("Access-Control-Expose-Headers") ?? "";
      if (!exposed.includes("X-Wikidata-Linked")) {
        response.headers.set(
          "Access-Control-Expose-Headers",
          exposed ? `${exposed}, X-Wikidata-Linked` : "X-Wikidata-Linked",
        );
      }
    }

    if (useCache && kv && cacheKey && result.status === 200) {
      await putCachedRead(
        c,
        kv,
        cacheKey,
        toCachedPayload({
          body,
          contentType,
          finalUrl: result.finalUrl,
          status: result.status,
          redirects: result.redirects,
          ...(result.engine ? { engine: result.engine } : {}),
        }),
      );
    }

    if (input.track && kv && result.page) {
      try {
        const snapshot = await makeSnapshot(result.page, input);
        const trackPromise = saveSnapshot(kv, input.url, snapshot);
        if (c.executionCtx) {
          c.executionCtx.waitUntil(trackPromise);
        } else {
          await trackPromise;
        }
      } catch {}
    }

    response.headers.set("X-Cache", "MISS");
    return response;
  } catch (err) {
    if (err instanceof ReaderFetchError) {
      return c.json({ error: "fetch_failed", message: err.message }, err.status as 502 | 504);
    }
    const e = err as Error;
    console.error("Reader internal error:", e?.stack ?? e);
    return c.json({ error: "internal_error", message: e.message ?? "Unknown error" }, 500);
  }
}

export async function handle(
  c: Context,
  input: Parameters<typeof read>[0],
  env: CloudflareBindings,
) {
  const method = c.req.method.toUpperCase();
  const useCache = method === "GET" && input.cache !== "bypass";
  const kv = env.CACHE;

  let cacheKey: string | null = null;
  if (useCache && kv) {
    cacheKey = buildCacheKey(c.req.url, input, "read");
    const cached = await getCachedRead(kv, cacheKey);
    if (cached) {
      const response = buildResponse(
        c,
        cached.body,
        cached.contentType,
        cached.status,
        cached.finalUrl,
        cached.redirects,
        cached.engine,
        input.format === "toon" ? "toon" : undefined,
      );
      response.headers.set("X-Cache", "HIT");
      return response;
    }
  }

  try {
    const result = await read({ ...input, env });
    const response = buildResponse(
      c,
      result.body,
      result.contentType,
      result.status,
      result.finalUrl,
      result.redirects,
      result.engine,
      input.format === "toon" ? "toon" : undefined,
    );

    if (useCache && kv && cacheKey && result.status === 200) {
      await putCachedRead(c, kv, cacheKey, toCachedPayload(result));
    }

    if (input.track && kv && result.page) {
      try {
        const snapshot = await makeSnapshot(result.page, input);
        const trackPromise = saveSnapshot(kv, input.url, snapshot);
        if (c.executionCtx) {
          c.executionCtx.waitUntil(trackPromise);
        } else {
          await trackPromise;
        }
      } catch {}
    }

    response.headers.set("X-Cache", "MISS");
    return response;
  } catch (err) {
    if (err instanceof ReaderFetchError) {
      return c.json({ error: "fetch_failed", message: err.message }, err.status as 502 | 504);
    }
    const e = err as Error;
    console.error("Reader internal error:", e?.stack ?? e);
    return c.json({ error: "internal_error", message: e.message ?? "Unknown error" }, 500);
  }
}
