import type { ClassifiedBlock } from "../classifier";
import type { JSON_LD_CONTEXT } from "./context";

export interface JsonLdDocument {
  "@context": typeof JSON_LD_CONTEXT;
  "@graph": JsonLdNode[];
}

export type JsonLdNode = Record<string, unknown>;

export interface ContentSection {
  heading: string | null;
  level: number;
  content: ClassifiedBlock[];
  children: ContentSection[];
}

export interface GraphBuildOptions {
  wikidata?: boolean;
  wikidataLimit?: number;
  wikidataClaims?: boolean;
  lang?: string;
}
