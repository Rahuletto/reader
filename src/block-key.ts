import type { ClassifiedBlock } from "./classifier";
import { blockText } from "./classifier";

export function fnv1aHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function stableBlockKey(block: ClassifiedBlock): string {
  const type = block.classification ?? block.type ?? "block";
  return `${type}:${fnv1aHash(blockText(block))}`;
}

export function stableMarkerId(type: string, content: string): string {
  return fnv1aHash(`${type}:${content}`).slice(0, 12);
}
