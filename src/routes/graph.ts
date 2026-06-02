import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { OpenApiTag } from "../openapi";
import { ErrorSchema, GraphBodySchema, GraphQuerySchema, KnowledgeGraphSchema } from "../types";
import { handleGraph, headerOverrides } from "./helpers";

const graphRouter = new OpenAPIHono<WorkerEnv>({
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

const graphResponses = {
  200: {
    description:
      "JSON-LD document using schema.org, with optional Wikidata links on recognized entities. Set `wikidata=false` to omit Wikidata enrichment.",
    content: {
      "application/ld+json": { schema: KnowledgeGraphSchema },
      "application/json": { schema: KnowledgeGraphSchema },
    },
  },
  400: {
    description: "Validation error",
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

const graphQueryRoute = createRoute({
  method: "get",
  path: "/graph",
  tags: [OpenApiTag.Graph],
  operationId: "knowledgeGraphQuery",
  summary: "Knowledge graph (query)",
  description:
    "Fetch and extract a URL, then return JSON-LD linked to Wikidata (wbsearchentities + wdt: claims). schema.org + wd:/wdt: context.",
  request: {
    query: GraphQuerySchema,
  },
  responses: graphResponses,
});

const graphPostRoute = createRoute({
  method: "post",
  path: "/graph",
  tags: [OpenApiTag.Graph],
  operationId: "knowledgeGraphBody",
  summary: "Knowledge graph (JSON body)",
  description: "Same as GET /graph but accepts url and options in the request body.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: GraphBodySchema } },
    },
  },
  responses: graphResponses,
});

graphRouter.openapi(graphQueryRoute, async (c) => {
  const { url, ...opts } = c.req.valid("query");
  return (await handleGraph(c, { ...opts, ...headerOverrides(c), url }, c.env)) as never;
});

graphRouter.openapi(graphPostRoute, async (c) => {
  const body = c.req.valid("json");
  const { url, method, headers, body: reqBody, ...opts } = body;
  return (await handleGraph(
    c,
    {
      ...opts,
      ...headerOverrides(c),
      url,
      ...(method ? { method } : {}),
      ...(headers ? { headers } : {}),
      ...(reqBody !== undefined ? { body: reqBody } : {}),
    },
    c.env,
  )) as never;
});

export { graphRouter };
