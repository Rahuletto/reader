import type { ClassificationType } from "./classifier";

export const MARKER_TYPES = [
  "pricing",
  "date",
  "author",
  "contact",
  "product",
  "rating",
  "code",
  "table",
  "image",
  "link",
  "heading",
  "list",
  "paragraph",
] as const satisfies readonly ClassificationType[];

const MARKER_TYPE_SET = new Set<string>(MARKER_TYPES);

export function parseMarkerFilter(value: unknown): ClassificationType[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const raw: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) raw.push(String(v));
  } else {
    raw.push(String(value));
  }

  const out: ClassificationType[] = [];
  for (const item of raw) {
    for (const part of item.split(",")) {
      const t = part.trim().toLowerCase();
      if (MARKER_TYPE_SET.has(t)) out.push(t as ClassificationType);
    }
  }

  return out.length > 0 ? [...new Set(out)] : undefined;
}

export function hasMarkerFilter(marker: ClassificationType[] | undefined): boolean {
  return Array.isArray(marker) && marker.length > 0;
}

export function shouldMarkClassification(
  classification: ClassificationType | undefined,
  filter: ClassificationType[],
): boolean {
  return classification !== undefined && filter.includes(classification);
}
