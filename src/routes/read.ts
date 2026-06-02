import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { OpenApiTag } from "../openapi";
import {
  ErrorSchema,
  PostBodySchema,
  ReadOptionsSchema,
  JsonResponseSchema,
  type ReadOptions,
} from "../types";
import { handle, headerOverrides, negotiateFormat, normalizeUrl } from "./helpers";

const readRouter = new OpenAPIHono<WorkerEnv>({
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

const PASSTHROUGH_PATHS = new Set(["docs", "openapi.json", "favicon.ico"]);

const RESERVED_PATHS = new Set([
  "",
  "read",
  "graph",
  "diff",
  "robots",
  "sitemap",
  "robots.txt",
]);

const queryRoute = createRoute({
  method: "get",
  path: "/read",
  tags: [OpenApiTag.Extract],
  operationId: "extractContentQuery",
  summary: "Extract page content",
  description: "Fetches a URL and returns the main content. Pass the target address as the `url` query parameter.",
  request: {
    query: ReadOptionsSchema.extend({
      url: z.string().url().openapi({
        description: "The page to fetch and extract.",
        example: "https://example.com",
      }),
    }),
  },
  responses: {
    200: {
      description: "Extracted page content in the requested format.",
      content: {
        "text/plain": { schema: z.string() },
        "text/toon": {
          schema: z.string().openapi({ description: "TOON-encoded structured content" }),
        },
        "text/html": { schema: z.string() },
        "application/json": { schema: JsonResponseSchema },
      },
    },
    400: {
      description: "Invalid or missing parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "The target URL could not be fetched",
      content: { "application/json": { schema: ErrorSchema } },
    },
    504: {
      description: "The target URL did not respond in time",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

readRouter.openapi(queryRoute, async (c) => {
  const q = c.req.valid("query");
  const opts: ReadOptions = { ...q, ...headerOverrides(c) };
  const format = negotiateFormat(opts.format);
  return (await handle(c, { ...opts, format, url: q.url }, c.env)) as never;
});

const postRoute = createRoute({
  method: "post",
  path: "/read",
  tags: [OpenApiTag.Extract],
  operationId: "extractContentBody",
  summary: "Extract page content (POST)",
  description: "Same as the GET endpoint, with the URL and options sent in the request body.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PostBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Extracted page content in the requested format.",
      content: {
        "text/plain": { schema: z.string() },
        "text/toon": {
          schema: z.string().openapi({ description: "TOON-encoded structured content" }),
        },
        "text/html": { schema: z.string() },
        "application/json": { schema: JsonResponseSchema },
      },
    },
    400: {
      description: "Invalid or missing parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "The target URL could not be fetched",
      content: { "application/json": { schema: ErrorSchema } },
    },
    504: {
      description: "The target URL did not respond in time",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

readRouter.openapi(postRoute, async (c) => {
  const body = c.req.valid("json");
  const query = c.req.query();
  const merged = ReadOptionsSchema.safeParse({ ...query, ...body });
  const opts: ReadOptions = {
    ...(merged.success ? merged.data : body),
    ...headerOverrides(c),
  };
  const format = negotiateFormat(opts.format);
  return (await handle(
    c,
    {
      ...opts,
      format,
      url: body.url,
      ...(body.method ? { method: body.method } : {}),
      ...(body.headers ? { headers: body.headers } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
    },
    c.env,
  )) as never;
});

readRouter.openAPIRegistry.registerPath({
  method: "get",
  path: "/{url}",
  tags: [OpenApiTag.Extract],
  operationId: "extractContentPath",
  summary: "Extract page content (URL in path)",
  description:
    "Fetches a page when the target URL is encoded in the path. Reader options such as `format` and `ua` remain in the query string.",
  request: {
    params: z.object({
      url: z.string().openapi({
        param: { name: "url", in: "path" },
        description: "URL-encoded target address, including any query string meant for the upstream page.",
        example: "https://example.com",
      }),
    }),
    query: ReadOptionsSchema,
  },
  responses: {
    200: {
      description: "Extracted page content in the requested format.",
      content: {
        "text/plain": { schema: z.string() },
        "text/toon": {
          schema: z.string().openapi({ description: "TOON-encoded structured content" }),
        },
        "text/html": { schema: z.string() },
        "application/json": { schema: JsonResponseSchema },
      },
    },
    400: { description: "The path could not be parsed as a URL", content: { "application/json": { schema: ErrorSchema } } },
    502: {
      description: "The target URL could not be fetched",
      content: { "application/json": { schema: ErrorSchema } },
    },
    504: {
      description: "The target URL did not respond in time",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

readRouter.get("*", async (c, next) => {
  let fullPath = c.req.path.slice(1);
  try {
    fullPath = decodeURIComponent(fullPath);
  } catch {}

  const firstSeg = fullPath.split("/", 1)[0] ?? "";
  const subpath = fullPath.slice(firstSeg.length);
  const hasSubpath = subpath.startsWith("/") && subpath.length > 1;

  if (PASSTHROUGH_PATHS.has(firstSeg) && !hasSubpath) {
    return await next();
  }

  if (RESERVED_PATHS.has(firstSeg)) {
    if (hasSubpath) {
      return c.json(
        {
          error: "not_found",
          message: `Not found: /${fullPath}. Use GET /${firstSeg}?url={url} or POST /${firstSeg} with a JSON body.`,
        },
        404,
      );
    }
    return c.notFound();
  }

  const ours = new Set(Object.keys(ReadOptionsSchema.shape));
  const reqUrl = new URL(c.req.url);
  const upstreamQs = new URLSearchParams();
  const ourQs = new URLSearchParams();
  for (const [k, v] of reqUrl.searchParams.entries()) {
    (ours.has(k) ? ourQs : upstreamQs).append(k, v);
  }
  const candidate = fullPath + (upstreamQs.toString() ? "?" + upstreamQs.toString() : "");
  const normalized = normalizeUrl(candidate);
  if (!normalized) {
    return c.json({ error: "bad_url", message: `Could not parse URL: ${candidate}` }, 400);
  }

  const parsed = ReadOptionsSchema.safeParse(Object.fromEntries(ourQs.entries()));
  if (!parsed.success) {
    return c.json(
      {
        error: "validation_error",
        message: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  }
  const opts: ReadOptions = { ...parsed.data, ...headerOverrides(c) };
  const format = negotiateFormat(opts.format);
  return await handle(c, { ...opts, format, url: normalized }, c.env);
});

export { readRouter };
