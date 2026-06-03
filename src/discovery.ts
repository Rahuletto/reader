import { parseHTML } from "linkedom";
import { fetchPage, type FetchOptions, type FetchResult } from "./fetcher";

export interface RobotsRule {
  agent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export interface ParsedRobots {
  sitemaps: string[];
  rules: RobotsRule[];
  host?: string;
}

export interface ParsedSitemap {
  type: "index" | "urlset" | "unknown";
  urls: string[];
  sitemaps: string[];
}

const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/wp-sitemap.xml",
  "/sitemap.txt",
];

function siteOrigin(inputUrl: string): string {
  const u = new URL(inputUrl);
  return u.origin;
}

function absResolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function tryFetch(url: string, opts: FetchOptions): Promise<FetchResult | null> {
  try {
    const res = await fetchPage({ ...opts, url });
    if (res.status >= 200 && res.status < 300) return res;
  } catch {}
  return null;
}

export function parseRobotsTxt(text: string): ParsedRobots {
  const sitemaps: string[] = [];
  const rules: RobotsRule[] = [];
  let host: string | undefined;
  let current: RobotsRule | null = null;

  const pushCurrent = (): void => {
    if (current) rules.push(current);
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!value) continue;

    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "host") {
      host = value;
      continue;
    }
    if (key === "user-agent") {
      pushCurrent();
      current = { agent: value, allow: [], disallow: [] };
      continue;
    }
    if (!current) continue;

    if (key === "allow") current.allow.push(value);
    else if (key === "disallow") current.disallow.push(value);
    else if (key === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) current.crawlDelay = n;
    }
  }

  pushCurrent();
  return { sitemaps: [...new Set(sitemaps)], rules, ...(host ? { host } : {}) };
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const sitemaps = [
    ...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi),
  ].map((m) => m[1]!.trim());
  const urls = [...xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/url>/gi)].map(
    (m) => m[1]!.trim(),
  );

  if (sitemaps.length > 0) {
    return { type: "index", urls: [], sitemaps: [...new Set(sitemaps)] };
  }
  if (urls.length > 0) {
    return { type: "urlset", urls: [...new Set(urls)], sitemaps: [] };
  }

  const fallbackLocs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
  const isIndex = /<sitemapindex/i.test(xml);
  if (isIndex) {
    return { type: "index", urls: [], sitemaps: [...new Set(fallbackLocs)] };
  }
  if (fallbackLocs.length > 0) {
    return { type: "urlset", urls: [...new Set(fallbackLocs)], sitemaps: [] };
  }
  return { type: "unknown", urls: [], sitemaps: [] };
}

export async function fetchRobots(
  inputUrl: string,
  opts: FetchOptions,
): Promise<{
  robotsUrl: string;
  fetched: FetchResult;
  parsed: ParsedRobots;
}> {
  const origin = siteOrigin(inputUrl);
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const fetched = await tryFetch(robotsUrl, opts);
  if (!fetched) {
    throw new RobotsNotFoundError(`robots.txt not found for ${origin}`);
  }
  return {
    robotsUrl,
    fetched,
    parsed: parseRobotsTxt(fetched.html),
  };
}

export async function discoverSitemapCandidates(
  inputUrl: string,
  opts: FetchOptions,
): Promise<string[]> {
  const origin = siteOrigin(inputUrl);
  const candidates: string[] = [];

  const robots = await tryFetch(new URL("/robots.txt", origin).toString(), opts);
  if (robots) {
    candidates.push(...parseRobotsTxt(robots.html).sitemaps);
  }

  const homepage = await tryFetch(origin, opts);
  if (homepage) {
    try {
      const { document } = parseHTML(homepage.html);
      for (const el of Array.from(
        document.querySelectorAll('link[rel="sitemap"], link[rel="Sitemap"]'),
      ) as Array<{ getAttribute(name: string): string | null }>) {
        const href = el.getAttribute("href");
        const resolved = href ? absResolve(href, homepage.finalUrl) : null;
        if (resolved) candidates.push(resolved);
      }
    } catch {}
  }

  for (const path of COMMON_SITEMAP_PATHS) {
    candidates.push(new URL(path, origin).toString());
  }

  return [...new Set(candidates)];
}

export async function fetchBestSitemap(
  inputUrl: string,
  opts: FetchOptions,
): Promise<{
  discovered: string[];
  sitemapUrl: string;
  fetched: FetchResult;
  parsed: ParsedSitemap;
}> {
  const discovered = await discoverSitemapCandidates(inputUrl, opts);

  const hits = await Promise.all(
    discovered.map(async (candidate) => {
      const fetched = await tryFetch(candidate, opts);
      if (!fetched) return null;
      const ct = fetched.contentType.toLowerCase();
      const body = fetched.html.trim();
      if (!body) return null;
      const looksXml =
        ct.includes("xml") ||
        body.startsWith("<?xml") ||
        body.includes("<urlset") ||
        body.includes("<sitemapindex");
      if (!looksXml && !ct.includes("text/plain")) return null;
      return {
        sitemapUrl: fetched.finalUrl,
        fetched,
        parsed: parseSitemapXml(body),
      };
    }),
  );

  for (const hit of hits) {
    if (hit) {
      return { discovered, ...hit };
    }
  }

  throw new SitemapNotFoundError(`No sitemap found for ${siteOrigin(inputUrl)}`);
}

export async function expandSitemapIndex(
  indexXml: string,
  indexUrl: string,
  opts: FetchOptions,
  limit = 20,
): Promise<{ sitemapUrl: string; urls: string[] }[]> {
  const parsed = parseSitemapXml(indexXml);
  const childUrls = parsed.sitemaps.slice(0, limit);
  const expanded = await Promise.all(
    childUrls.map(async (childUrl) => {
      const resolved = absResolve(childUrl, indexUrl) ?? childUrl;
      const fetched = await tryFetch(resolved, opts);
      if (!fetched) return null;
      const childParsed = parseSitemapXml(fetched.html);
      return { sitemapUrl: fetched.finalUrl, urls: childParsed.urls };
    }),
  );

  return expanded.filter(
    (entry): entry is NonNullable<(typeof expanded)[number]> => entry !== null,
  );
}

export class RobotsNotFoundError extends Error {
  override readonly name = "RobotsNotFoundError";
}

export class SitemapNotFoundError extends Error {
  override readonly name = "SitemapNotFoundError";
}
