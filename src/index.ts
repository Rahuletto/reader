import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { infoRouter } from "./routes/info";
import { readRouter } from "./routes/read";
import { diffRouter } from "./routes/diff";
import { graphRouter } from "./routes/graph";
import { crawlRouter } from "./routes/crawl";
import { OpenApiTag, openApiTagDefinitions } from "./openapi";
import { FormatEnum } from "./types";
import { ReaderFetchError } from "./reader";
import { API_VERSION } from "./version";

const app = new OpenAPIHono<WorkerEnv>({
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
    return;
  },
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Reader API",
    version: API_VERSION,
    description:
      "Reader fetches web pages and returns clean, structured content. Use **Extract** for readable output, **Graph** for JSON-LD with Wikidata links, **Changes** to diff pages over time, and **Discovery** for robots.txt and sitemaps.",
  },
  tags: [...openApiTagDefinitions],
  "x-tagGroups": [
    { name: "Getting started", tags: [OpenApiTag.Meta] },
    { name: "Content", tags: [OpenApiTag.Extract, OpenApiTag.Graph, OpenApiTag.Changes] },
    { name: "Site discovery", tags: [OpenApiTag.Discovery] },
  ],
} as Parameters<typeof app.doc>[1]);

app.get(
  "/docs",
  apiReference({
    spec: { url: "/openapi.json" },
    pageTitle: "Reader API",
    theme: "deepSpace",
  }),
);

app.route("/", crawlRouter);
app.route("/", diffRouter);
app.route("/", graphRouter);
app.route("/", infoRouter);
app.route("/", readRouter);

void FormatEnum;

app.onError((err, c) => {
  if (err instanceof ReaderFetchError) {
    return c.json({ error: "fetch_failed", message: err.message }, err.status as 502 | 504);
  }
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export default app;
