import { z } from "@hono/zod-openapi";
import { MARKER_TYPES, parseMarkerFilter } from "./marker-filter";

export const MarkerTypeEnum = z.enum(MARKER_TYPES);

export const FormatEnum = z.enum(["markdown", "html", "text", "json", "raw", "toon"]).openapi({
  description:
    "Response format. Defaults to markdown. Use `json` for structured blocks, `toon` for a compact encoding, or `raw` for the upstream HTML. Knowledge graphs are available at `GET /graph`. You may also set this via the `Accept` header.",
  example: "markdown",
});

export const LinksEnum = z.enum(["inline", "referenced", "discard"]).openapi({
  description:
    "How links appear in markdown. `inline` keeps standard links, `referenced` moves URLs to a footnote list, and `discard` removes links entirely.",
  example: "inline",
});

export const ImagesEnum = z.enum(["keep", "discard", "alt-only"]).openapi({
  description: "Whether to keep images, drop them, or keep alt text only.",
  example: "keep",
});

export const CacheEnum = z.enum(["default", "bypass", "force"]).openapi({
  description: "Controls edge caching when fetching the target URL.",
  example: "default",
});

export const UaPreset = z.enum(["chrome", "googlebot", "bingbot", "firefox"]).openapi({
  example: "chrome",
});

const BooleanString = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1")
  .openapi({ type: "boolean", example: true });

export const ReadOptionsSchema = z.object({
  format: FormatEnum.optional(),
  selector: z.string().optional().openapi({
    description: "Limit extraction to elements matching this CSS selector.",
    example: "article",
  }),
  frontmatter: BooleanString.optional().openapi({
    description: "Prepend YAML frontmatter when returning markdown. Enabled by default.",
  }),
  links: LinksEnum.optional(),
  images: ImagesEnum.optional(),
  ua: z.string().optional().openapi({
    description:
      "User-Agent sent to the target site. Use a preset (`chrome`, `googlebot`, `bingbot`, `firefox`) or provide a full string.",
    example: "chrome",
  }),
  timeout: z.coerce.number().int().min(1000).max(30_000).optional().openapi({
    description: "Maximum time to wait for the target URL, in milliseconds (1,000–30,000). Defaults to 15,000.",
    example: 15000,
  }),
  cache: CacheEnum.optional(),
  marker: z
    .union([MarkerTypeEnum, z.array(MarkerTypeEnum), z.string()])
    .optional()
    .transform((v) => parseMarkerFilter(v))
    .openapi({
      description:
        "Wrap matching blocks in HTML comments for downstream parsing (for example `pricing` or `link`). Pass once, repeat the parameter, or use a comma-separated list. Requires `classify=true` or a `marker` value.",
      example: "pricing",
    }),
  classify: BooleanString.optional().openapi({
    description:
      "Label blocks by type (pricing, date, author, and others). Turned on automatically when `marker` is set.",
  }),
  track: BooleanString.optional().openapi({
    description: "Save a snapshot after extraction so later `/diff` requests can compare changes.",
  }),
});

export const PostBodySchema = ReadOptionsSchema.extend({
  url: z.string().url().openapi({ example: "https://example.com" }),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional().openapi({
    description: "HTTP method used when requesting the target URL.",
    example: "GET",
  }),
  headers: z.record(z.string(), z.string()).optional().openapi({
    description: "Extra request headers to send to the target URL.",
  }),
  body: z.string().optional().openapi({
    description: "Request body to send to the target URL (for methods other than GET or HEAD).",
  }),
});

export type ReadOptions = z.infer<typeof ReadOptionsSchema>;
export type PostBody = z.infer<typeof PostBodySchema>;
export type Format = z.infer<typeof FormatEnum>;

export interface PageMetadata {
  url: string;
  finalUrl: string;
  status: number;
  title?: string;
  description?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  lang?: string;
  canonical?: string;
  image?: string;
  favicon?: string;
  type?: string;
  locale?: string;
  twitter?: Record<string, string>;
  og?: Record<string, string>;
  jsonld?: unknown[];
  contentType?: string;
  length?: number;
  excerpt?: string;
  byline?: string;
  redirects?: string[];
  frameworks?: string[];
  engine?: string;
  sitemap?: string;
  robots?: string;
}

export interface ExtractedPage {
  metadata: PageMetadata;
  html: string;
  rawHtml: string;
  textContent: string;
  isJinaMarkdownFallback?: boolean;
}

export const JsonResponseSchema = z
  .object({
    metadata: z.record(z.string(), z.any()),
    content: z.array(z.any()),
  })
  .openapi("JsonResponse");

export const KnowledgeGraphSchema = z
  .object({
    "@context": z.union([
      z.literal("https://schema.org"),
      z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
    ]),
    "@graph": z.array(z.record(z.string(), z.unknown())),
  })
  .openapi("KnowledgeGraph");

const GraphOptionsBase = ReadOptionsSchema.omit({ format: true });

const GraphWikidataSchema = z.object({
  wikidata: BooleanString.optional().openapi({
    description:
      "Link recognized entities to Wikidata items. Enabled by default; set to false to skip Wikidata lookups.",
  }),
  wikidataLimit: z.coerce.number().int().min(0).max(15).optional().openapi({
    description: "Maximum number of entities to link per page. Defaults to 8.",
    example: 8,
  }),
  wikidataClaims: BooleanString.optional().openapi({
    description:
      "Include Wikidata statements on linked entities using `wdt:` predicates. Enabled by default.",
  }),
});

export const GraphQuerySchema = GraphOptionsBase.merge(GraphWikidataSchema).extend({
  url: z.string().url().openapi({ example: "https://example.com" }),
});

export type GraphReadOptions = z.infer<typeof GraphQuerySchema>;

export const GraphBodySchema = GraphOptionsBase.merge(GraphWikidataSchema).extend({
  url: z.string().url().openapi({ example: "https://example.com" }),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

export const DiffFormatEnum = z.enum(["unified", "json", "markdown", "text"]).openapi({
  description:
    "How to return the diff. `unified` (default) uses familiar +/- lines; `json` returns structured changes. `markdown` and `text` are aliases for `unified`.",
  example: "unified",
});

const DiffOptionsBase = ReadOptionsSchema.omit({ format: true });

export const DiffQuerySchema = DiffOptionsBase.extend({
  url: z.string().url().openapi({ example: "https://example.com" }),
  format: DiffFormatEnum.optional(),
  update: BooleanString.optional().openapi({
    description: "Replace the stored snapshot with this extraction. Enabled by default.",
  }),
});

export const DiffBodySchema = DiffQuerySchema;

export const DiffResponseSchema = z
  .object({
    url: z.string(),
    previousAt: z.string().nullable(),
    currentAt: z.string(),
    summary: z.object({
      added: z.number(),
      removed: z.number(),
      changed: z.number(),
      unchanged: z.number(),
    }),
    changes: z.array(
      z.object({
        type: z.enum(["added", "removed", "changed"]),
        classification: z.string().optional(),
        before: z.string().optional(),
        after: z.string().optional(),
      }),
    ),
  })
  .openapi("DiffResponse");

export const ErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    status: z.number().optional(),
  })
  .openapi("Error");
