export const OpenApiTag = {
  Meta: "Meta",
  Extract: "Extract",
  Graph: "Graph",
  Changes: "Changes",
  Discovery: "Discovery",
} as const;

export type OpenApiTagName = (typeof OpenApiTag)[keyof typeof OpenApiTag];

export const openApiTagDefinitions = [
  {
    name: OpenApiTag.Meta,
    description: "Service metadata, version, and quick-start examples.",
  },
  {
    name: OpenApiTag.Extract,
    description:
      "Fetch a URL and return the main content as markdown, JSON, HTML, plain text, TOON, or raw bytes.",
  },
  {
    name: OpenApiTag.Graph,
    description:
      "Turn a page into JSON-LD with schema.org structure and optional Wikidata entity links.",
  },
  {
    name: OpenApiTag.Changes,
    description:
      "Compare the latest extraction with a stored snapshot to see what changed on a page.",
  },
  {
    name: OpenApiTag.Discovery,
    description: "Locate and retrieve a site's robots.txt and sitemap files.",
  },
] as const;
