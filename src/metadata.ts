import type { PageMetadata } from "./types";

interface DocLike {
  querySelector(
    sel: string,
  ): { getAttribute(name: string): string | null; textContent: string | null } | null;
  querySelectorAll(sel: string): ArrayLike<{
    getAttribute(name: string): string | null;
    textContent: string | null;
  }>;
  documentElement?: { getAttribute(name: string): string | null } | null;
}

function attr(doc: DocLike, sel: string, name: string): string | undefined {
  const el = doc.querySelector(sel);
  const v = el?.getAttribute(name);
  return v?.trim() || undefined;
}

function text(doc: DocLike, sel: string): string | undefined {
  return doc.querySelector(sel)?.textContent?.trim() || undefined;
}

function metaContent(doc: DocLike, name: string): string | undefined {
  return (
    attr(doc, `meta[property="${name}"]`, "content") ?? attr(doc, `meta[name="${name}"]`, "content")
  );
}

function absUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function detectFrameworks(doc: DocLike, html: string): string[] {
  const frameworks: string[] = [];

  const scriptEls = Array.from(doc.querySelectorAll("script"));
  const scriptSrcs: string[] = [];
  let inlineScripts = "";
  for (const el of scriptEls) {
    const src = el.getAttribute("src");
    if (src) scriptSrcs.push(src);
    const content = el.textContent;
    if (content) inlineScripts += content + "\n";
  }
  const allScriptText = scriptSrcs.join("\n") + "\n" + inlineScripts;

  const generatorMeta = (
    doc.querySelector('meta[name="generator"]')?.getAttribute("content") ?? ""
  ).toLowerCase();

  if (
    doc.querySelector("script[id='__NEXT_DATA__']") ||
    doc.querySelector("#__next") ||
    html.includes("/_next/static/")
  ) {
    frameworks.push("Next.js");
  }

  if (
    doc.querySelector("script[id='__NUXT_DATA__']") ||
    doc.querySelector("#__nuxt") ||
    html.includes("/_nuxt/") ||
    html.includes("__NUXT__")
  ) {
    frameworks.push("Nuxt");
  }

  if (
    doc.querySelector("#___gatsby") ||
    html.includes("/page-data/") ||
    html.includes("gatsby-focus-wrapper")
  ) {
    frameworks.push("Gatsby");
  }

  if (
    doc.querySelector('meta[name="__remix-server"]') ||
    inlineScripts.includes("__remixContext")
  ) {
    frameworks.push("Remix");
  }

  if (doc.querySelector("astro-island") || /class="[^"]*astro-[a-zA-Z0-9]/.test(html)) {
    frameworks.push("Astro");
  }

  if (
    html.includes("ng-version=") ||
    html.includes("_ngcontent-") ||
    html.includes("ng-app=") ||
    html.includes("ng-content")
  ) {
    frameworks.push("Angular");
  }

  if (/data-v-[0-9a-f]+/.test(html) || html.includes("__VUE__") || doc.querySelector("[v-cloak]")) {
    frameworks.push("Vue.js");
  }

  if (
    html.includes("__sveltekit") ||
    html.includes("__svelte") ||
    /\bclass="[^"]*svelte-[a-z0-9]+/.test(html)
  ) {
    frameworks.push("Svelte");
  }

  if (
    html.includes("data-reactroot") ||
    html.includes("__react-root") ||
    html.includes("__reactFiber$") ||
    html.includes("_reactListening") ||
    allScriptText.includes("react-dom")
  ) {
    if (
      !frameworks.includes("Next.js") &&
      !frameworks.includes("Gatsby") &&
      !frameworks.includes("Remix")
    ) {
      frameworks.push("React");
    }
  }

  if (
    allScriptText.includes("webpackChunk") ||
    allScriptText.includes("__webpack_require__") ||
    allScriptText.includes("__webpack_modules__")
  ) {
    frameworks.push("Webpack");
  }

  if (
    scriptSrcs.some((s) => s.includes("/@vite/")) ||
    allScriptText.includes("import.meta.hot") ||
    allScriptText.includes("__vite_ssr_import__")
  ) {
    frameworks.push("Vite");
  }

  if (allScriptText.includes("parcelRequire")) {
    frameworks.push("Parcel");
  }

  if (
    html.includes("wp-content/") ||
    html.includes("wp-includes/") ||
    html.includes("wp-json") ||
    generatorMeta.includes("wordpress")
  ) {
    frameworks.push("WordPress");
  }

  if (
    html.includes("cdn.shopify.com") ||
    html.includes("myshopify.com") ||
    allScriptText.includes("Shopify.")
  ) {
    frameworks.push("Shopify");
  }

  if (
    html.includes("wix.com") ||
    html.includes("wixstatic.com") ||
    html.includes("wix-warmup-data")
  ) {
    frameworks.push("Wix");
  }

  if (html.includes("squarespace.com") || /class="[^"]*sqs-/.test(html)) {
    frameworks.push("Squarespace");
  }

  if (html.includes("webflow.js") || /class="[^"]*w-[a-z]/.test(html)) {
    frameworks.push("Webflow");
  }

  if (
    generatorMeta.includes("docusaurus") ||
    html.includes("/assets/js/docusaurus") ||
    scriptSrcs.some((s) => s.includes("docusaurus"))
  ) {
    frameworks.push("Docusaurus");
  }

  if (generatorMeta.includes("hugo")) {
    frameworks.push("Hugo");
  }

  if (generatorMeta.includes("jekyll")) {
    frameworks.push("Jekyll");
  }

  if (generatorMeta.includes("eleventy")) {
    frameworks.push("Eleventy");
  }

  if (generatorMeta.includes("mkdocs") || html.includes("mkdocs-material")) {
    frameworks.push("MkDocs");
  }

  const tailwindPatterns = [
    /class="[^"]*\bflex\b/,
    /class="[^"]*\bbg-[a-z]+-\d/,
    /class="[^"]*\btext-[a-z]+-\d/,
    /class="[^"]*\bmin-h-screen\b/,
    /class="[^"]*\bspace-x-/,
    /class="[^"]*\bdivide-y\b/,
    /class="[^"]*\brounded-[a-z]/,
    /class="[^"]*\bpx-\d/,
    /class="[^"]*\bpy-\d/,
  ];
  const tailwindHits = tailwindPatterns.filter((rx) => rx.test(html)).length;
  if (tailwindHits >= 3) {
    frameworks.push("Tailwind CSS");
  }

  if (
    html.includes("bootstrap.min.css") ||
    html.includes("bootstrap.min.js") ||
    scriptSrcs.some((s) => s.includes("bootstrap"))
  ) {
    frameworks.push("Bootstrap");
  }

  return frameworks;
}

export function extractMetadata(
  doc: DocLike,
  url: string,
  finalUrl: string,
  status: number,
  contentType: string,
  html: string,
): PageMetadata {
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};

  for (const el of Array.from(doc.querySelectorAll("meta"))) {
    const property = el.getAttribute("property");
    const name = el.getAttribute("name");
    const content = el.getAttribute("content");
    if (!content) continue;
    if (property?.startsWith("og:")) og[property.slice(3)] = content;
    if (name?.startsWith("twitter:")) twitter[name.slice(8)] = content;
    if (property?.startsWith("twitter:")) twitter[property.slice(8)] = content;
  }

  const jsonld: unknown[] = [];
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const raw = el.textContent;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) jsonld.push(...parsed);
      else jsonld.push(parsed);
    } catch {}
  }

  const title =
    metaContent(doc, "og:title") ??
    text(doc, "title") ??
    attr(doc, 'meta[name="title"]', "content");

  const description =
    metaContent(doc, "og:description") ??
    metaContent(doc, "description") ??
    metaContent(doc, "twitter:description");

  const image = absUrl(metaContent(doc, "og:image") ?? metaContent(doc, "twitter:image"), finalUrl);

  const favicon =
    absUrl(attr(doc, 'link[rel="icon"]', "href"), finalUrl) ??
    absUrl(attr(doc, 'link[rel="shortcut icon"]', "href"), finalUrl) ??
    absUrl(attr(doc, 'link[rel="apple-touch-icon"]', "href"), finalUrl) ??
    absUrl("/favicon.ico", finalUrl);

  const canonical = absUrl(attr(doc, 'link[rel="canonical"]', "href"), finalUrl);
  const lang = doc.documentElement?.getAttribute("lang") ?? undefined;

  const frameworks = detectFrameworks(doc, html);

  const meta: PageMetadata = {
    url,
    finalUrl,
    status,
  };
  if (contentType) meta.contentType = contentType;
  if (title) meta.title = title;
  if (description) meta.description = description;
  const siteName = metaContent(doc, "og:site_name");
  if (siteName) meta.siteName = siteName;
  const author =
    metaContent(doc, "author") ??
    metaContent(doc, "article:author") ??
    attr(doc, 'meta[name="author"]', "content");
  if (author) meta.author = author;
  const published = metaContent(doc, "article:published_time") ?? metaContent(doc, "date");
  if (published) meta.publishedTime = published;
  const modified = metaContent(doc, "article:modified_time");
  if (modified) meta.modifiedTime = modified;
  if (lang) meta.lang = lang;
  if (canonical) meta.canonical = canonical;
  if (image) meta.image = image;
  if (favicon) meta.favicon = favicon;
  const type = metaContent(doc, "og:type");
  if (type) meta.type = type;
  const locale = metaContent(doc, "og:locale");
  if (locale) meta.locale = locale;
  if (Object.keys(og).length) meta.og = og;
  if (Object.keys(twitter).length) meta.twitter = twitter;
  if (jsonld.length) meta.jsonld = jsonld;
  if (frameworks.length) meta.frameworks = frameworks;
  const sitemapLink = absUrl(attr(doc, 'link[rel="sitemap"]', "href"), finalUrl);
  if (sitemapLink) {
    meta.sitemap = sitemapLink;
  } else {
    try {
      meta.sitemap = new URL("/sitemap.xml", finalUrl).toString();
    } catch {}
  }
  try {
    meta.robots = new URL("/robots.txt", finalUrl).toString();
  } catch {}
  return meta;
}
