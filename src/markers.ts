import type { ClassificationType, ClassifiedBlock } from "./classifier";
import { blockText } from "./classifier";
import { stableMarkerId as markerIdFromContent } from "./block-key";
import { shouldMarkClassification } from "./marker-filter";

export const MARKER_OPEN_RE = /<!-- READER:([a-z]+):([a-z0-9]+) -->/g;
export const MARKER_CLOSE_RE = /<!-- \/READER:([a-z]+):([a-z0-9]+) -->/g;

export function markerOpen(type: ClassificationType | string, id: string): string {
  return `<!-- READER:${type}:${id} -->`;
}

export function markerClose(type: ClassificationType | string, id: string): string {
  return `<!-- /READER:${type}:${id} -->`;
}

export function wrapWithMarkers(
  text: string,
  type: ClassificationType | string,
  id: string,
): string {
  return `${markerOpen(type, id)}\n${text}\n${markerClose(type, id)}`;
}

export function assignMarkers(
  blocks: ClassifiedBlock[],
  filter: ClassificationType[],
): ClassifiedBlock[] {
  return blocks.map((block) => {
    if (!shouldMarkClassification(block.classification, filter)) return block;
    const id = markerIdFromContent(block.classification!, blockText(block));
    return Object.assign({}, block, { marker: `READER-${block.classification}-${id}` });
  });
}

function assignMarkersDeep(
  blocks: ClassifiedBlock[],
  filter: ClassificationType[],
): ClassifiedBlock[] {
  return assignMarkers(blocks, filter).map((block) => {
    if (block.type === "group" && Array.isArray(block.children)) {
      return Object.assign({}, block, {
        children: assignMarkersDeep(block.children as ClassifiedBlock[], filter),
      });
    }
    return block;
  });
}

export function assignMarkersTree(tree: unknown[], filter: ClassificationType[]): unknown[] {
  return tree.map((section) => {
    const s = section as { content?: ClassifiedBlock[]; children?: unknown[] };
    const next = { ...s };
    if (Array.isArray(s.content)) {
      next.content = assignMarkersDeep(s.content, filter);
    }
    if (Array.isArray(s.children)) {
      next.children = assignMarkersTree(s.children, filter);
    }
    return next;
  });
}

function blockToMarkdown(block: ClassifiedBlock): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Number(block.level) || 1)} ${block.text ?? ""}`;
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.code ?? ""}\n\`\`\``;
    case "blockquote":
      return `> ${block.text ?? ""}`;
    case "image":
      return `![${block.alt ?? ""}](${block.src ?? ""})`;
    case "link":
      return `[${block.text ?? ""}](${block.href ?? ""})`;
    case "list": {
      const items = (block.items as unknown[]) ?? [];
      return items
        .map((item, i) => {
          const prefix = block.ordered ? `${i + 1}.` : "-";
          const text =
            typeof item === "string"
              ? item
              : `[${(item as ClassifiedBlock).text ?? ""}](${(item as ClassifiedBlock).href ?? ""})`;
          return `${prefix} ${text}`;
        })
        .join("\n");
    }
    case "table": {
      const headers = (block.headers as string[]) ?? [];
      const rows = (block.rows as string[][]) ?? [];
      if (!headers.length) return "";
      const lines = [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((r) => `| ${r.join(" | ")} |`),
      ];
      return lines.join("\n");
    }
    default:
      return String(block.text ?? "");
  }
}

export function injectMarkersMarkdown(blocks: ClassifiedBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const md = blockToMarkdown(block);
    if (!md.trim()) continue;
    if (block.marker && block.classification) {
      const [, type, id] = block.marker.match(/^READER-([a-z]+)-(.+)$/) ?? [];
      if (type && id) {
        parts.push(wrapWithMarkers(md, type, id));
        continue;
      }
    }
    parts.push(md);
  }
  return parts.join("\n\n");
}

export function parseMarkersFromText(text: string): Array<{
  type: string;
  id: string;
  content: string;
}> {
  const results: Array<{ type: string; id: string; content: string }> = [];
  const re = /<!-- READER:([a-z]+):([a-z0-9]+) -->([\s\S]*?)<!-- \/READER:\1:\2 -->/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    results.push({
      type: match[1]!,
      id: match[2]!,
      content: match[3]!.trim(),
    });
  }
  return results;
}
