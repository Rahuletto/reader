import type { ClassifiedBlock } from "./classifier";
import { stableBlockKey } from "./block-key";

export interface PageSnapshot {
  fetchedAt: string;
  contentHash: string;
  blocks: ClassifiedBlock[];
  metadata: Record<string, unknown>;
}

export interface DiffChange {
  type: "added" | "removed" | "changed";
  classification?: string;
  before?: string;
  after?: string;
}

export interface DiffResult {
  url: string;
  previousAt: string | null;
  currentAt: string;
  summary: { added: number; removed: number; changed: number; unchanged: number };
  changes: DiffChange[];
}

function blockContent(block: ClassifiedBlock): string {
  if (typeof block.text === "string") return block.text;
  if (typeof block.code === "string") return block.code;
  return JSON.stringify(block);
}

export async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function snapshotKey(url: string): Promise<string> {
  const hash = await contentHash(url);
  return `snapshot:${hash}`;
}

export function diffSnapshots(
  url: string,
  previous: PageSnapshot | null,
  current: PageSnapshot,
): DiffResult {
  const prevMap = new Map<string, ClassifiedBlock>();
  const currMap = new Map<string, ClassifiedBlock>();

  for (const b of previous?.blocks ?? []) {
    prevMap.set(stableBlockKey(b), b);
  }
  for (const b of current.blocks) {
    currMap.set(stableBlockKey(b), b);
  }

  const changes: DiffChange[] = [];
  let unchanged = 0;

  for (const [key, curr] of currMap) {
    const prev = prevMap.get(key);
    if (!prev) {
      changes.push({
        type: "added",
        ...(curr.classification ? { classification: curr.classification } : {}),
        after: blockContent(curr),
      });
    } else if (blockContent(prev) !== blockContent(curr)) {
      changes.push({
        type: "changed",
        ...((curr.classification ?? prev.classification)
          ? { classification: curr.classification ?? prev.classification }
          : {}),
        before: blockContent(prev),
        after: blockContent(curr),
      });
    } else {
      unchanged++;
    }
  }

  for (const [key, prev] of prevMap) {
    if (!currMap.has(key)) {
      changes.push({
        type: "removed",
        ...(prev.classification ? { classification: prev.classification } : {}),
        before: blockContent(prev),
      });
    }
  }

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const changed = changes.filter((c) => c.type === "changed").length;

  return {
    url,
    previousAt: previous?.fetchedAt ?? null,
    currentAt: current.fetchedAt,
    summary: { added, removed, changed, unchanged },
    changes,
  };
}
