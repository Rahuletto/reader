import type { ClassifiedBlock } from "../classifier";
import { stableBlockKey } from "../block-key";
import { fnv1aHash } from "../block-key";

export function documentBase(finalUrl: string): string {
  return finalUrl.split("#")[0]!;
}

export function webpageId(base: string): string {
  return `${base}#webpage`;
}

export function sectionId(
  base: string,
  heading: string | null,
  level: number,
  index: number,
): string {
  const label = heading ? fnv1aHash(heading) : "preamble";
  return `${base}#section-l${level}-${label}-${index}`;
}

export function blockId(base: string, block: ClassifiedBlock): string {
  return `${base}#block-${stableBlockKey(block).replace(":", "-")}`;
}

export function personId(base: string, name: string): string {
  return `${base}#person-${fnv1aHash(name)}`;
}

export function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
