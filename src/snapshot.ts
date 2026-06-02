import { buildContentTree } from "./formatters/json";
import { flattenTree } from "./classifier";
import type { ExtractedPage, ReadOptions } from "./types";
import { contentHash, snapshotKey, type PageSnapshot } from "./diff";

export async function makeSnapshot(page: ExtractedPage, opts: ReadOptions): Promise<PageSnapshot> {
  const blocks = flattenTree(buildContentTree(page, opts));
  const text = blocks
    .map((b) => (typeof b.text === "string" ? b.text : JSON.stringify(b)))
    .join("\n");
  return {
    fetchedAt: new Date().toISOString(),
    contentHash: await contentHash(text),
    blocks,
    metadata: page.metadata as unknown as Record<string, unknown>,
  };
}

export async function loadSnapshot(kv: KVNamespace, url: string): Promise<PageSnapshot | null> {
  const key = await snapshotKey(url);
  return kv.get<PageSnapshot>(key, "json");
}

export async function saveSnapshot(
  kv: KVNamespace,
  url: string,
  snapshot: PageSnapshot,
): Promise<void> {
  const key = await snapshotKey(url);
  await kv.put(key, JSON.stringify(snapshot), { expirationTtl: 60 * 60 * 24 * 30 });
}
