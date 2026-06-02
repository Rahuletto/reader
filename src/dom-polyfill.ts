import { DOMParser as LinkedomDOMParser, parseHTML } from "linkedom";

const g = globalThis as unknown as {
  DOMParser?: unknown;
  window?: { DOMParser?: unknown; document?: unknown };
  document?: unknown;
};

if (!g.DOMParser) g.DOMParser = LinkedomDOMParser;

class WorkerDOMParser {
  parseFromString(input: string, _mime?: string): unknown {
    const { document } = parseHTML(input || "<html></html>");
    return document;
  }
}

const Parser = WorkerDOMParser as unknown as typeof LinkedomDOMParser;
g.DOMParser = Parser;

const { document: fakeDoc } = parseHTML("<html></html>");
if (!g.window) g.window = { DOMParser: Parser, document: fakeDoc };
else {
  if (!g.window.DOMParser) g.window.DOMParser = Parser;
  if (!g.window.document) g.window.document = fakeDoc;
}
if (!g.document) g.document = fakeDoc;
