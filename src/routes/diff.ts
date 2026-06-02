import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { read } from "../reader";
import { diffSnapshots } from "../diff";
import { formatDiffUnified, resolveDiffOutput } from "../diff-format";
import { loadSnapshot, makeSnapshot, saveSnapshot } from "../snapshot";
import {
  DiffBodySchema,
  DiffQuerySchema,
  DiffResponseSchema,
  ErrorSchema,
  type ReadOptions,
} from "../types";
import { OpenApiTag } from "../openapi";
import { headerOverrides, normalizeUrl } from "./helpers";

interface DiffInput {
  url: string;
  update?: boolean | string;
  format?: string;
  opts: ReadOptions;
}

function parseUpdate(value: boolean | string | undefined): boolean {
  return value === undefined || value === true || value === "true" || value === "1";
}

async function runDiff(c: Context, input: DiffInput) {
  const url = normalizeUrl(input.url);
  if (!url) {
    return c.json({ error: "bad_url", message: `Could not parse URL: ${input.url}` }, 400);
  }

  const update = parseUpdate(input.update);
  const diffOutput = resolveDiffOutput(input.format);
  const readOpts = {
    ...input.opts,
    url,
    format: "json" as const,
    classify: input.opts.classify ?? false,
  };

  const result = await read({ ...readOpts, env: c.env });

  if (!result.page) {
    return c.json({ error: "diff_unavailable", message: "Could not extract page for diff." }, 400);
  }

  const kv = c.env.CACHE;
  const previous = kv ? await loadSnapshot(kv, url) : null;
  const current = await makeSnapshot(result.page, readOpts);
  const diff = diffSnapshots(url, previous, current);

  if (update && kv) {
    await saveSnapshot(kv, url, current);
  }

  c.header("X-Diff-Previous", previous?.fetchedAt ?? "none");
  c.header("X-Diff-Added", String(diff.summary.added));
  c.header("X-Diff-Removed", String(diff.summary.removed));
  c.header("X-Diff-Changed", String(diff.summary.changed));

  if (diffOutput === "json") {
    return c.json(diff, 200);
  }

  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(formatDiffUnified(diff), 200) as never;
}

const diffRouter = new OpenAPIHono<WorkerEnv>({
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

const diffResponses = {
  200: {
    description: "Diff result (unified git-style text by default, or JSON with format=json).",
    content: {
      "text/plain": { schema: z.string() },
      "application/json": { schema: DiffResponseSchema },
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

const diffQueryRoute = createRoute({
  method: "get",
  path: "/diff",
  tags: [OpenApiTag.Changes],
  operationId: "diffContentQuery",
  summary: "Diff content (query)",
  description:
    "Fetches and extracts the URL, compares against the previous KV snapshot. Default output is git-style unified diff (+/- lines). Use format=json for structured output.",
  request: {
    query: DiffQuerySchema,
  },
  responses: diffResponses,
});

const diffPostRoute = createRoute({
  method: "post",
  path: "/diff",
  tags: [OpenApiTag.Changes],
  operationId: "diffContentBody",
  summary: "Diff content (JSON body)",
  description: "Same as GET /diff but accepts url and options in the request body.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: DiffBodySchema } },
    },
  },
  responses: diffResponses,
});

diffRouter.openapi(diffQueryRoute, async (c) => {
  const q = c.req.valid("query");
  const { url: targetUrl, update, format, ...rest } = q;
  return runDiff(c, {
    url: targetUrl,
    ...(update !== undefined ? { update } : {}),
    ...(format !== undefined ? { format } : {}),
    opts: { ...rest, ...headerOverrides(c) },
  });
});

diffRouter.openapi(diffPostRoute, async (c) => {
  const body = c.req.valid("json");
  const { url: targetUrl, update, format, ...rest } = body;
  return runDiff(c, {
    url: targetUrl,
    ...(update !== undefined ? { update } : {}),
    ...(format !== undefined ? { format } : {}),
    opts: { ...rest, ...headerOverrides(c) },
  });
});

export { diffRouter, runDiff };
