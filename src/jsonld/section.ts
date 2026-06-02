import type { ContentSection, JsonLdNode } from "./types";
import { blockPartIds, blockToSchemaNodes, orderedParts, partRef } from "./block";
import { sectionId } from "./ids";

export function buildSectionNodes(
  section: ContentSection,
  base: string,
  index: number,
  parentId: string,
): { nodes: JsonLdNode[]; sectionId: string } {
  const sid = sectionId(base, section.heading, section.level, index);
  const partIds: string[] = [];
  const nodes: JsonLdNode[] = [];

  const sectionNode: JsonLdNode = {
    "@id": sid,
    "@type": "WebPageElement",
    isPartOf: partRef(parentId),
  };

  if (section.heading) {
    sectionNode["name"] = section.heading;
    sectionNode["headline"] = section.heading;
  }
  if (section.level > 0) sectionNode["position"] = section.level;

  for (const block of section.content) {
    const blockNodes = blockToSchemaNodes(block, base);
    nodes.push(...blockNodes);
    partIds.push(...blockPartIds(block, base));
  }

  section.children.forEach((child, childIndex) => {
    const childResult = buildSectionNodes(child, base, childIndex, sid);
    nodes.push(...childResult.nodes);
    partIds.push(childResult.sectionId);
  });

  sectionNode["hasPart"] = orderedParts(partIds);
  nodes.unshift(sectionNode);

  return { nodes, sectionId: sid };
}

export function buildContentNodes(
  tree: unknown[],
  base: string,
  webpageId: string,
): { nodes: JsonLdNode[]; topSectionIds: string[] } {
  const sections = tree as ContentSection[];
  const allNodes: JsonLdNode[] = [];
  const topSectionIds: string[] = [];

  sections.forEach((section, i) => {
    const result = buildSectionNodes(section, base, i, webpageId);
    allNodes.push(...result.nodes);
    topSectionIds.push(result.sectionId);
  });

  return { nodes: allNodes, topSectionIds };
}
