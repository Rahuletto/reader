import type { JsonLdNode } from "../jsonld/types";
import { entityIri, propertyIri } from "./api";
import type { WikibaseEntity } from "./api";

const CLAIM_PROPS = [
  "P31",
  "P279",
  "P361",
  "P17",
  "P27",
  "P106",
  "P569",
  "P570",
  "P856",
  "P159",
  "P112",
  "P127",
  "P749",
  "P166",
  "P800",
] as const;

function snakToValue(snak: { datavalue?: { type?: string; value?: unknown } }): unknown {
  const dv = snak.datavalue;
  if (dv?.value === undefined || dv?.value === null) return undefined;
  const val = dv.value;

  switch (dv.type) {
    case "wikibase-entityid": {
      const v = val as { id?: string };
      const id = String(v["id"] ?? "");
      return id ? { "@id": entityIri(id) } : undefined;
    }
    case "string":
    case "external-id":
      return typeof val === "string" ? val : undefined;
    case "time": {
      const v = val as { time?: string };
      const t = String(v["time"] ?? "");
      return t.startsWith("+") ? t.slice(1, 11) : t.slice(0, 10);
    }
    case "monolingualtext": {
      const v = val as { text?: string };
      return String(v["text"] ?? "");
    }
    case "quantity": {
      const v = val as { amount?: string };
      return String(v["amount"] ?? "").replace(/^\+/, "");
    }
    case "globecoordinate":
      return undefined;
    default:
      return undefined;
  }
}

export function entityToJsonLd(
  qid: string,
  entity: WikibaseEntity,
  lang: string,
  maxClaimsPerProp = 3,
): JsonLdNode {
  const node: JsonLdNode = {
    "@id": entityIri(qid),
  };

  const label = entity.labels?.[lang]?.value ?? Object.values(entity.labels ?? {})[0]?.value;
  if (label) {
    node["rdfs:label"] = label;
    node["skos:prefLabel"] = label;
  }

  const desc =
    entity.descriptions?.[lang]?.value ?? Object.values(entity.descriptions ?? {})[0]?.value;
  if (desc) node["skos:definition"] = desc;

  const claims = entity.claims ?? {};
  for (const pid of CLAIM_PROPS) {
    const statements = claims[pid];
    if (!statements?.length) continue;

    const values: unknown[] = [];
    for (const st of statements.slice(0, maxClaimsPerProp)) {
      const val = st.mainsnak ? snakToValue(st.mainsnak) : undefined;
      if (val !== undefined) values.push(val);
    }
    if (!values.length) continue;

    const key = `wdt:${pid}`;
    node[key] = values.length === 1 ? values[0] : values;
  }

  return node;
}

export { propertyIri };
