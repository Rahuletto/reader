import { encode } from "@toon-format/toon";
import type { ExtractedPage, ReadOptions } from "../types";
import { toJson } from "./json";

export function toToon(page: ExtractedPage, opts: ReadOptions): string {
  const data = toJson(page, opts);
  return encode(data, { indent: 2 });
}
