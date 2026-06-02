import type { PageMetadata } from "./types";

function set(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && value === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return;
  }
  out[key] = value;
}

export function metadataRecord(meta: PageMetadata): Record<string, unknown> {
  const out: Record<string, unknown> = {
    url: meta.url,
    finalUrl: meta.finalUrl,
    status: meta.status,
  };

  set(out, "contentType", meta.contentType);
  set(out, "title", meta.title);
  set(out, "description", meta.description);
  set(out, "siteName", meta.siteName);
  set(out, "author", meta.author);
  set(out, "publishedTime", meta.publishedTime);
  set(out, "modifiedTime", meta.modifiedTime);
  set(out, "lang", meta.lang);
  set(out, "canonical", meta.canonical);
  set(out, "image", meta.image);
  set(out, "favicon", meta.favicon);
  set(out, "type", meta.type);
  set(out, "locale", meta.locale);
  set(out, "excerpt", meta.excerpt);
  set(out, "byline", meta.byline);
  set(out, "length", meta.length);
  set(out, "sitemap", meta.sitemap);
  set(out, "robots", meta.robots);
  set(out, "redirects", meta.redirects);
  set(out, "frameworks", meta.frameworks);
  set(out, "og", meta.og);
  set(out, "twitter", meta.twitter);
  set(out, "jsonld", meta.jsonld);

  return out;
}
