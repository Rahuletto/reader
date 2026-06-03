import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { OpenApiTag } from "../openapi";
import { API_VERSION } from "../version";

const infoRouter = new OpenAPIHono<WorkerEnv>();

const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: [OpenApiTag.Meta],
  operationId: "getApiInfo",
  summary: "API overview",
  description: "Returns the service name, API version, supported formats, and example requests.",
  responses: {
    200: {
      description: "Service metadata and usage hints.",
      content: {
        "application/json": { schema: z.any() },
      },
    },
  },
});

infoRouter.openapi(rootRoute, (c) => {
  return c.json(
    {
      name: "Reader",
      version: API_VERSION,
      usage: {
        extract: "GET /read?url={url}",
        extractPost: "POST /read with JSON body",
        extractPath: "GET /{encoded-url}?format=markdown",
        graph: "GET /graph?url={url}",
        diff: "GET /diff?url={url}",
        robots: "GET /robots?url={url}",
        sitemap: "GET /sitemap?url={url}&expand=true",
      },
      formats: ["markdown", "html", "text", "json", "toon", "raw"],
      marker: {
        param: "marker=pricing or marker=pricing,link",
        pattern: "<!-- READER:{type}:{id} --> ... <!-- /READER:{type}:{id} -->",
        types: [
          "pricing",
          "date",
          "author",
          "contact",
          "product",
          "rating",
          "code",
          "table",
          "image",
          "link",
          "heading",
          "list",
        ],
      },
      docs: "/docs",
      openapi: "/openapi.json",
    },
    200,
  );
});

export { infoRouter };
