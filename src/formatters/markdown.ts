import "../dom-polyfill";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { stringify as toYaml } from "yaml";
import type { ExtractedPage, ReadOptions } from "../types";
import { metadataRecord } from "../metadata-record";
import { buildContentTree } from "./json";
import { flattenTree } from "../classifier";
import { hasMarkerFilter } from "../marker-filter";
import { injectMarkersMarkdown } from "../markers";

export function makeTurndown(opts: ReadOptions, baseUrl: string): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: opts.links === "referenced" ? "referenced" : "inlined",
    hr: "---",
  });
  td.use(gfm);

  td.remove(["script", "style", "noscript", "iframe", "form", "button"]);

  td.addRule("gfm-tables", {
    filter: "table",
    replacement: (_, node) => {
      const tableEl = node as any;
      const rows = Array.from(tableEl.querySelectorAll("tr") as any[]).filter(
        (row: any) => row.closest("table") === tableEl,
      );
      if (rows.length === 0) return "";

      let maxCols = 0;
      const rowData = rows.map((row: any) => {
        const cells = Array.from(row.querySelectorAll("th, td") as any[]).filter(
          (cell: any) => cell.closest("tr") === row,
        );
        if (cells.length > maxCols) maxCols = cells.length;
        return cells.map((cell: any) => {
          return td.turndown(cell.innerHTML).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
        });
      });

      if (maxCols === 0) return "";

      const headerRow = rowData[0] || [];
      const bodyRows = rowData.slice(1);

      while (headerRow.length < maxCols) {
        headerRow.push("");
      }

      const dividerRow = Array(maxCols).fill("---");

      const markdownRows = [];
      markdownRows.push("| " + headerRow.join(" | ") + " |");
      markdownRows.push("| " + dividerRow.join(" | ") + " |");

      for (const row of bodyRows) {
        while (row.length < maxCols) {
          row.push("");
        }
        markdownRows.push("| " + row.join(" | ") + " |");
      }

      return "\n\n" + markdownRows.join("\n") + "\n\n";
    },
  });

  td.addRule("absolute-links", {
    filter: "a",
    replacement: (content, node) => {
      const el = node as unknown as { getAttribute(n: string): string | null };
      const href = el.getAttribute("href");
      if (!href || opts.links === "discard") return content;
      const abs = safeAbs(href, baseUrl);
      const title = el.getAttribute("title");
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
      return `[${content}](${abs}${titlePart})`;
    },
  });

  if (opts.images === "discard") {
    td.addRule("drop-img", { filter: "img", replacement: () => "" });
  } else if (opts.images === "alt-only") {
    td.addRule("alt-img", {
      filter: "img",
      replacement: (_c, node) => {
        const el = node as unknown as { getAttribute(n: string): string | null };
        return el.getAttribute("alt")?.trim() ?? "";
      },
    });
  } else {
    td.addRule("absolute-img", {
      filter: "img",
      replacement: (_c, node) => {
        const el = node as unknown as { getAttribute(n: string): string | null };
        const src = el.getAttribute("src");
        if (!src) return "";
        const alt = (el.getAttribute("alt") ?? "").replace(/[[\]\n]/g, " ").trim();
        const abs = safeAbs(src, baseUrl);
        return `![${alt}](${abs})`;
      },
    });
  }

  return td;
}

function safeAbs(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function buildFrontmatter(meta: Parameters<typeof metadataRecord>[0]): string {
  const body = toYaml(metadataRecord(meta), { lineWidth: 0 }).trimEnd();
  return `---\n${body}\n---\n\n`;
}

export function toMarkdown(page: ExtractedPage, opts: ReadOptions): string {
  let md: string;
  if (hasMarkerFilter(opts.marker)) {
    const tree = buildContentTree(page, { ...opts, classify: true });
    md = injectMarkersMarkdown(flattenTree(tree));
  } else {
    md = (page as any).isJinaMarkdownFallback
      ? page.html.trim()
      : makeTurndown(opts, page.metadata.finalUrl).turndown(page.html).trim();
  }
  const includeFrontmatter = opts.frontmatter !== false;
  return includeFrontmatter ? buildFrontmatter(page.metadata) + md + "\n" : md + "\n";
}
