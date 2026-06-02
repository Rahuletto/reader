import { parseHTML } from "linkedom";
import { extractMetadata } from "./metadata";
import { reconstructFromJSON } from "./reconstructor";
import type { ExtractedPage, ReadOptions } from "./types";

export interface ExtractInput {
  html: string;
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  options: ReadOptions;
}

function extractTextsFromObject(obj: any, collected: string[] = []): string[] {
  if (obj === null || obj === undefined) return collected;

  if (typeof obj === "string") {
    const trimmed = obj.trim();
    if (
      trimmed.length > 20 &&
      trimmed.includes(" ") &&
      !trimmed.startsWith("http") &&
      !trimmed.includes("import ") &&
      !trimmed.includes("const ") &&
      !trimmed.includes("React") &&
      !/^[a-zA-Z0-9_\-./]+$/.test(trimmed)
    ) {
      collected.push(trimmed);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item) => extractTextsFromObject(item, collected));
  } else if (typeof obj === "object") {
    Object.values(obj).forEach((val) => extractTextsFromObject(val, collected));
  }

  return collected;
}

export async function extract({
  html,
  url,
  finalUrl,
  status,
  contentType,
  options,
}: ExtractInput): Promise<ExtractedPage> {
  let cleanHtml = html;
  if (typeof HTMLRewriter !== "undefined") {
    try {
      const response = new Response(html);
      const rewriter = new HTMLRewriter()
        .on("script:not([id='__NEXT_DATA__']):not([type='application/ld+json'])", {
          element(el) {
            el.remove();
          },
        })
        .on("style", {
          element(el) {
            el.remove();
          },
        })
        .on("noscript", {
          element(el) {
            el.remove();
          },
        })
        .on("iframe", {
          element(el) {
            el.remove();
          },
        });
      cleanHtml = await rewriter.transform(response).text();
    } catch {}
  }

  const spacedHtml = cleanHtml
    .replace(/<\/span>\s*<span/gi, "</span> <span")
    .replace(/<\/div>\s*<div/gi, "</div> <div")
    .replace(/<\/span>\s*<div/gi, "</span> <div")
    .replace(/<\/div>\s*<span/gi, "</div> <span")
    .replace(/<\/h([1-6])>\s*<h([1-6])/gi, "</h$1> <h$2>")
    .replace(/<\/a>\s*<a/gi, "</a> <a");

  const { document } = parseHTML(spacedHtml);

  const metadata = extractMetadata(document as never, url, finalUrl, status, contentType, html);

  if (typeof HTMLRewriter === "undefined") {
    const scripts = document.querySelectorAll(
      "script:not([id='__NEXT_DATA__']):not([type='application/ld+json']), style, noscript, iframe",
    );
    for (const s of Array.from(scripts) as any[]) {
      s.remove();
    }
  }

  let root: Element | null = null;
  if (options.selector) {
    root = document.querySelector(options.selector) as Element | null;
  }

  const target = root ?? document.body ?? document.documentElement;
  let bodyHtml = (target as unknown as { innerHTML?: string })?.innerHTML ?? "";
  let textContent = (target?.textContent ?? "").trim();
  metadata.engine = "dom";

  if (!bodyHtml || textContent.length < 100) {
    const sentences: string[] = [];

    const nextDataEl = document.querySelector("script[id='__NEXT_DATA__']");
    if (nextDataEl) {
      try {
        const nextJson = JSON.parse(nextDataEl.textContent || "");
        const reconstructed = reconstructFromJSON(nextJson);
        if (reconstructed && reconstructed.textContent.length > 100) {
          bodyHtml = reconstructed.html;
          textContent = reconstructed.textContent;
          metadata.engine = "json-reconstructor";
          if (reconstructed.title && !metadata.title) metadata.title = reconstructed.title;
        } else {
          extractTextsFromObject(nextJson, sentences);
        }
      } catch {}
    }

    const remixMatch = html.match(/window\.__remixContext\s*=\s*(\{.*?\});/s);
    if (remixMatch) {
      try {
        const remixJson = JSON.parse(remixMatch[1] as string);
        const reconstructed = reconstructFromJSON(remixJson);
        if (reconstructed && reconstructed.textContent.length > 100) {
          bodyHtml = reconstructed.html;
          textContent = reconstructed.textContent;
          metadata.engine = "json-reconstructor";
          if (reconstructed.title && !metadata.title) metadata.title = reconstructed.title;
        } else {
          extractTextsFromObject(remixJson, sentences);
        }
      } catch {}
    }

    const islands = document.querySelectorAll("astro-island");
    let astroHtml = "";
    for (const island of Array.from(islands)) {
      const propsStr = (island as any).getAttribute("props");
      if (propsStr) {
        try {
          const props = JSON.parse(propsStr as string);
          const reconstructed = reconstructFromJSON(props);
          if (reconstructed && reconstructed.textContent.length > 50) {
            astroHtml += reconstructed.html + "\n";
          } else {
            extractTextsFromObject(props, sentences);
          }
        } catch {}
      }
    }

    if (astroHtml) {
      bodyHtml = astroHtml;
      const { document: tempDoc } = parseHTML(bodyHtml);
      textContent = tempDoc.body?.textContent || "";
      metadata.engine = "json-reconstructor";
    } else if (sentences.length > 0) {
      const uniqueSentences = Array.from(new Set(sentences));
      bodyHtml = uniqueSentences.map((s) => `<p>${s}</p>`).join("\n");
      textContent = uniqueSentences.join("\n\n");
      metadata.engine = "json-reconstructor";
    }
  }

  return {
    metadata,
    html: bodyHtml,
    rawHtml: html,
    textContent: collapseWhitespace(textContent),
  };
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
