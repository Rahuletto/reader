export interface WikidataSearchHit {
  id: string;
  label?: string;
  description?: string;
  matchScore?: number;
}

export interface LinkCandidate {
  localId: string;
  label: string;
  types: string[];
  existingQid?: string;
}

export interface EntityLink {
  localId: string;
  qid: string;
  label?: string;
  confidence: "exact" | "high" | "low";
}

export interface WikidataLinkOptions {
  enabled?: boolean;
  limit?: number;
  lang?: string;
  claims?: boolean;
  maxClaimsPerEntity?: number;
}
