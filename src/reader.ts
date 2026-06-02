import { fetchPage, type FetchResult, ReaderFetchError } from "./fetcher";
import { extract } from "./extractor";
import { toMarkdown } from "./formatters/markdown";
import { toJson } from "./formatters/json";
import { toToon } from "./formatters/toon";
import { reconstructFromJSON } from "./reconstructor";
import type { Format, ReadOptions, ExtractedPage } from "./types";

export interface ReadInput extends ReadOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  env?: CloudflareBindings;
}

interface JinaReaderResponse {
  data?: {
    content?: string;
    title?: string;
    description?: string;
  };
}

export interface ReadResponse {
  body: string;
  contentType: string;
  status: number;
  finalUrl: string;
  redirects: string[];
  engine?: string;
  page?: ExtractedPage;
}

const formatters: Record<
  Format,
  (
    page: ExtractedPage | null,
    opts: ReadInput,
    fetched: FetchResult,
  ) => { body: string; contentType: string }
> = {
  json: (page, opts) => ({
    body: JSON.stringify(toJson(page!, opts)),
    contentType: "application/json; charset=utf-8",
  }),
  toon: (page, opts) => ({
    body: toToon(page!, opts),
    contentType: "text/toon; charset=utf-8",
  }),
  html: (page) => ({
    body: page!.isJinaMarkdownFallback
      ? `<pre style="white-space: pre-wrap;">${page!.html}</pre>`
      : page!.html,
    contentType: "text/html; charset=utf-8",
  }),
  text: (page) => ({
    body: page!.textContent,
    contentType: "text/plain; charset=utf-8",
  }),
  markdown: (page, opts) => ({
    body: toMarkdown(page!, opts),
    contentType: "text/plain; charset=utf-8",
  }),
  raw: (_, __, fetched) => ({
    body: fetched.html,
    contentType: fetched.contentType || "text/html; charset=utf-8",
  }),
};

export async function read(input: ReadInput): Promise<ReadResponse> {
  const format: Format = input.format ?? "markdown";

  let robotsUrl = "";
  try {
    robotsUrl = new URL("/robots.txt", input.url).toString();
  } catch {}

  const [fetched, robotsFetched] = await Promise.all([
    fetchPage({
      url: input.url,
      ...(input.method ? { method: input.method } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.ua ? { ua: input.ua } : {}),
      ...(input.timeout ? { timeout: input.timeout } : {}),
      ...(input.cache ? { cache: input.cache } : {}),
      ...(input.env ? { env: input.env } : {}),
    }),
    robotsUrl
      ? fetchPage({
          url: robotsUrl,
          ...(input.ua ? { ua: input.ua } : {}),
          timeout: 3000,
          ...(input.cache ? { cache: input.cache } : {}),
          ...(input.env ? { env: input.env } : {}),
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (format === "raw") {
    const formatter = formatters[format];
    const { body, contentType } = formatter(null, input, fetched);
    return {
      body,
      contentType,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      redirects: fetched.redirects,
      engine: "raw",
    };
  }

  const ct = fetched.contentType.toLowerCase();
  const isHtml = ct.includes("html") || ct.includes("xml") || ct === "";

  if (!isHtml) {
    const rawPage: ExtractedPage = {
      metadata: {
        url: input.url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        redirects: fetched.redirects,
        contentType: fetched.contentType,
        engine: "raw",
      },
      html: fetched.html,
      rawHtml: fetched.html,
      textContent: fetched.html,
    };
    const formatter = formatters[format];
    const { body, contentType } = formatter(rawPage, input, fetched);
    return {
      body,
      contentType,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      redirects: fetched.redirects,
      engine: "raw",
    };
  }

  let page: ExtractedPage | null = null;
  const isGatsby = fetched.html.includes('id="___gatsby"') || fetched.html.includes("gatsby-");
  const isDocusaurus =
    fetched.html.includes("docusaurus") || fetched.html.includes('generator" content="Docusaurus');

  if (isHtml && isGatsby) {
    try {
      const urlObj = new URL(fetched.finalUrl);
      let path = urlObj.pathname;
      if (!path.endsWith("/")) path += "/";
      const gatsbyDataUrl = `${urlObj.origin}/page-data${path}page-data.json`;
      const res = await fetchPage({
        url: gatsbyDataUrl,
        ...(input.ua ? { ua: input.ua } : {}),
        ...(input.timeout ? { timeout: input.timeout } : {}),
        ...(input.cache ? { cache: input.cache } : {}),
        ...(input.env ? { env: input.env } : {}),
      });
      if (res.status === 200) {
        const gatsbyJson = JSON.parse(res.html);
        const reconstructed = reconstructFromJSON(gatsbyJson);
        if (reconstructed) {
          page = {
            metadata: {
              url: input.url,
              finalUrl: fetched.finalUrl,
              status: fetched.status,
              contentType: fetched.contentType,
              title:
                reconstructed.title || fetched.html.match(/<title>([^<]+)<\/title>/)?.[1] || "",
              frameworks: ["Gatsby"],
              engine: "json-reconstructor",
            },
            html: reconstructed.html,
            rawHtml: fetched.html,
            textContent: reconstructed.textContent,
          };
        }
      }
    } catch {}
  } else if (isHtml && isDocusaurus) {
    try {
      const assetPaths = [
        ...new Set(
          (fetched.html.match(/"\/assets\/[^"]+\.json"/g) || []).map((m) => m.slice(1, -1)),
        ),
      ];
      const urlObj = new URL(fetched.finalUrl);
      const assetResults = await Promise.all(
        assetPaths.map((jsonPath) =>
          fetchPage({
            url: `${urlObj.origin}${jsonPath}`,
            ...(input.ua ? { ua: input.ua } : {}),
            ...(input.timeout ? { timeout: input.timeout } : {}),
            ...(input.cache ? { cache: input.cache } : {}),
            ...(input.env ? { env: input.env } : {}),
          }),
        ),
      );
      for (const res of assetResults) {
        if (res.status !== 200) continue;
        const docusaurusJson = JSON.parse(res.html);
        const reconstructed = reconstructFromJSON(docusaurusJson);
        if (reconstructed) {
          page = {
            metadata: {
              url: input.url,
              finalUrl: fetched.finalUrl,
              status: fetched.status,
              contentType: fetched.contentType,
              title:
                reconstructed.title || fetched.html.match(/<title>([^<]+)<\/title>/)?.[1] || "",
              frameworks: ["Docusaurus"],
              engine: "json-reconstructor",
            },
            html: reconstructed.html,
            rawHtml: fetched.html,
            textContent: reconstructed.textContent,
          };
          break;
        }
      }
    } catch {}
  }

  let finalPage =
    page ??
    (await extract({
      html: fetched.html,
      url: input.url,
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      contentType: fetched.contentType,
      options: input,
    }));

  const hasStaticContent =
    finalPage.textContent.trim().length >= 150 ||
    (finalPage.textContent.trim().length > 30 &&
      (finalPage.html.includes("<p") ||
        finalPage.html.includes("<h1") ||
        finalPage.html.includes("<h2") ||
        finalPage.html.includes("<h3") ||
        finalPage.html.includes("<li") ||
        finalPage.html.includes("<td")));

  if (!hasStaticContent) {
    try {
      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(input.url)}`;
      const res = await fetch(jinaUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      if (res.status === 200) {
        const jinaJson = (await res.json()) as JinaReaderResponse;
        if (jinaJson?.data?.content) {
          const jinaMeta = { ...finalPage.metadata, engine: "jina" };
          if (jinaJson.data.title) jinaMeta.title = jinaJson.data.title;
          if (jinaJson.data.description) jinaMeta.description = jinaJson.data.description;
          finalPage = {
            ...finalPage,
            metadata: jinaMeta,
            html: jinaJson.data.content,
            textContent: jinaJson.data.content,
            isJinaMarkdownFallback: true,
          };
        }
      }
    } catch {}
  }

  finalPage.metadata.redirects = fetched.redirects;

  if (robotsFetched && robotsFetched.status === 200) {
    const sitemapMatch = robotsFetched.html.match(/^sitemap:\s*(https?:\/\/\S+)/im);
    if (sitemapMatch && sitemapMatch[1]) {
      finalPage.metadata.sitemap = sitemapMatch[1].trim();
    }
  }

  const formatter = formatters[format];
  const formatted = formatter(finalPage, input, fetched);

  return {
    body: formatted.body,
    contentType: formatted.contentType,
    status: fetched.status,
    finalUrl: fetched.finalUrl,
    redirects: fetched.redirects,
    page: finalPage,
    ...(finalPage.metadata.engine ? { engine: finalPage.metadata.engine } : {}),
  };
}

export { ReaderFetchError };
