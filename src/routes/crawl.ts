import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import {
  expandSitemapIndex,
  fetchBestSitemap,
  fetchRobots,
  RobotsNotFoundError,
  SitemapNotFoundError,
} from "../discovery";
import { ReaderFetchError, type FetchOptions } from "../fetcher";
import { CacheEnum, ErrorSchema } from "../types";
import { OpenApiTag } from "../openapi";
import { headerOverrides, normalizeUrl } from "./helpers";

const BooleanString = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

const CrawlQuerySchema = z.object({
  url: z.string().url().openapi({
    description: "Site URL (any page on the site; origin is used for discovery).",
    example: "https://example.com",
  }),
  format: z.enum(["raw", "json"]).optional().openapi({
    description: "Return raw file body or structured JSON. Default raw.",
    example: "raw",
  }),
  ua: z.string().optional(),
  timeout: z.coerce.number().int().min(1000).max(30_000).optional(),
  cache: CacheEnum.optional(),
  expand: BooleanString.optional().openapi({
    description: "For /sitemap: expand sitemap index and include child urlsets. Default false.",
  }),
});

const CrawlBodySchema = CrawlQuerySchema;

type CrawlInput = z.infer<typeof CrawlQuerySchema>;

function fetchOpts(url: string, q: CrawlInput, env: CloudflareBindings): FetchOptions {
  return {
    url,
    ...(q.ua ? { ua: q.ua } : {}),
    ...(q.timeout ? { timeout: q.timeout } : {}),
    ...(q.cache ? { cache: q.cache } : {}),
    env,
  };
}

function setFetchHeaders(
  c: { header: (k: string, v: string) => void },
  finalUrl: string,
  status: number,
  resolvedUrl: string,
) {
  c.header("X-Final-URL", finalUrl);
  c.header("X-Upstream-Status", String(status));
  c.header("X-Resolved-URL", resolvedUrl);
  c.header("Access-Control-Expose-Headers", "X-Final-URL, X-Upstream-Status, X-Resolved-URL");
}

function crawlOpts(c: Context, q: CrawlInput): CrawlInput {
  const headers = headerOverrides(c);
  return {
    ...q,
    ...(headers.ua ? { ua: headers.ua } : {}),
  };
}

async function handleRobots(c: Context, q: CrawlInput) {
  const url = normalizeUrl(q.url);
  if (!url) {
    return c.json({ error: "bad_url", message: `Could not parse URL: ${q.url}` }, 400);
  }

  const opts = crawlOpts(c, q);

  try {
    const { robotsUrl, fetched, parsed } = await fetchRobots(url, fetchOpts(url, opts, c.env));
    setFetchHeaders(c, fetched.finalUrl, fetched.status, robotsUrl);

    if (q.format === "json") {
      return c.json(
        {
          url,
          robotsUrl,
          finalUrl: fetched.finalUrl,
          status: fetched.status,
          contentType: fetched.contentType,
          content: fetched.html,
          sitemaps: parsed.sitemaps,
          rules: parsed.rules,
          ...(parsed.host ? { host: parsed.host } : {}),
        },
        200,
      );
    }

    c.header("Content-Type", fetched.contentType || "text/plain; charset=utf-8");
    return c.body(fetched.html, 200) as never;
  } catch (err) {
    if (err instanceof RobotsNotFoundError) {
      return c.json({ error: "not_found", message: err.message }, 404);
    }
    if (err instanceof ReaderFetchError) {
      return c.json({ error: "fetch_failed", message: err.message }, err.status as 502 | 504);
    }
    throw err;
  }
}

async function handleSitemap(c: Context, q: CrawlInput) {
  const url = normalizeUrl(q.url);
  if (!url) {
    return c.json({ error: "bad_url", message: `Could not parse URL: ${q.url}` }, 400);
  }

  const opts = crawlOpts(c, q);

  try {
    const { discovered, sitemapUrl, fetched, parsed } = await fetchBestSitemap(
      url,
      fetchOpts(url, opts, c.env),
    );
    setFetchHeaders(c, fetched.finalUrl, fetched.status, sitemapUrl);

    const expand = q.expand === true;
    const children =
      expand && parsed.type === "index"
        ? await expandSitemapIndex(fetched.html, fetched.finalUrl, fetchOpts(url, opts, c.env))
        : undefined;

    if (q.format === "json") {
      return c.json(
        {
          url,
          discovered,
          sitemapUrl: fetched.finalUrl,
          status: fetched.status,
          contentType: fetched.contentType,
          type: parsed.type,
          content: fetched.html,
          urls: parsed.urls,
          sitemaps: parsed.sitemaps,
          ...(children ? { children } : {}),
        },
        200,
      );
    }

    c.header("Content-Type", fetched.contentType || "application/xml; charset=utf-8");
    return c.body(fetched.html, 200) as never;
  } catch (err) {
    if (err instanceof SitemapNotFoundError) {
      return c.json({ error: "not_found", message: err.message }, 404);
    }
    if (err instanceof ReaderFetchError) {
      return c.json({ error: "fetch_failed", message: err.message }, err.status as 502 | 504);
    }
    throw err;
  }
}

const crawlRouter = new OpenAPIHono<WorkerEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "validation_error",
          message: result.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    }
  },
});

const robotsResponses = {
  200: {
    description: "robots.txt content.",
    content: {
      "text/plain": { schema: z.string() },
      "application/json": { schema: z.any() },
    },
  },
  400: {
    description: "Validation error",
    content: { "application/json": { schema: ErrorSchema } },
  },
  404: {
    description: "robots.txt not found",
    content: { "application/json": { schema: ErrorSchema } },
  },
  502: {
    description: "Upstream fetch failed",
    content: { "application/json": { schema: ErrorSchema } },
  },
  504: {
    description: "Upstream timeout",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

const robotsGetRoute = createRoute({
  method: "get",
  path: "/robots",
  tags: [OpenApiTag.Discovery],
  operationId: "fetchRobotsQuery",
  summary: "Fetch robots.txt (query)",
  description:
    "Resolves and returns robots.txt from the site origin. JSON format includes parsed rules and sitemap directives.",
  request: { query: CrawlQuerySchema },
  responses: robotsResponses,
});

const robotsPostRoute = createRoute({
  method: "post",
  path: "/robots",
  tags: [OpenApiTag.Discovery],
  operationId: "fetchRobotsBody",
  summary: "Fetch robots.txt (JSON body)",
  description: "Same as GET /robots but accepts url and options in the request body.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CrawlBodySchema } },
    },
  },
  responses: robotsResponses,
});

crawlRouter.openapi(robotsGetRoute, (c) => handleRobots(c, c.req.valid("query")));
crawlRouter.openapi(robotsPostRoute, (c) => handleRobots(c, c.req.valid("json")));

const sitemapResponses = {
  200: {
    description: "Sitemap content.",
    content: {
      "application/xml": { schema: z.string() },
      "text/plain": { schema: z.string() },
      "application/json": { schema: z.any() },
    },
  },
  400: {
    description: "Validation error",
    content: { "application/json": { schema: ErrorSchema } },
  },
  404: {
    description: "Sitemap not found",
    content: { "application/json": { schema: ErrorSchema } },
  },
  502: {
    description: "Upstream fetch failed",
    content: { "application/json": { schema: ErrorSchema } },
  },
  504: {
    description: "Upstream timeout",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

const sitemapGetRoute = createRoute({
  method: "get",
  path: "/sitemap",
  tags: [OpenApiTag.Discovery],
  operationId: "fetchSitemapQuery",
  summary: "Fetch sitemap (query)",
  description:
    "Discovers sitemap via robots.txt, HTML link rel, and common paths; returns the first valid sitemap. Use expand=true for sitemap indexes.",
  request: { query: CrawlQuerySchema },
  responses: sitemapResponses,
});

const sitemapPostRoute = createRoute({
  method: "post",
  path: "/sitemap",
  tags: [OpenApiTag.Discovery],
  operationId: "fetchSitemapBody",
  summary: "Fetch sitemap (JSON body)",
  description: "Same as GET /sitemap but accepts url and options in the request body.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CrawlBodySchema } },
    },
  },
  responses: sitemapResponses,
});

crawlRouter.openapi(sitemapGetRoute, (c) => handleSitemap(c, c.req.valid("query")));
crawlRouter.openapi(sitemapPostRoute, (c) => handleSitemap(c, c.req.valid("json")));

export { crawlRouter };
