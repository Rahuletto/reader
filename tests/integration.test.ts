import assert from "node:assert/strict";
import { before, describe, it, type TestContext } from "node:test";
import { FIXTURE_URL, BASE_URL, apiFetch } from "./fixtures";

const MARKER_RE = /<!-- READER:(pricing|date|link):[a-z0-9]+ -->/g;

async function expectOk(res: Response, label: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    assert.fail(`${label}: expected 2xx, got ${res.status} — ${body.slice(0, 300)}`);
  }
}

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe("Reader API integration", { timeout: 120_000, concurrency: 1 }, () => {
  let up = false;

  before(async () => {
    up = await serverReachable();
    if (!up) {
      console.warn(
        `\nSkipping integration tests: ${BASE_URL} is not reachable.\nStart the worker with: npm run dev\n`,
      );
    }
  });

  it("GET / returns API metadata", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/");
    await expectOk(res, "GET /");
    const json = (await res.json()) as { version?: string; usage?: Record<string, string> };
    assert.equal(json.version, "1.0.0");
    assert.match(json.usage?.["extract"] ?? "", /\/read\?url=/);
  });

  it("GET /openapi.json documents core routes", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/openapi.json");
    await expectOk(res, "openapi");
    const spec = (await res.json()) as { paths?: Record<string, unknown> };
    assert.ok(spec.paths?.["/read"]);
    assert.ok(spec.paths?.["/graph"]);
    assert.ok(spec.paths?.["/diff"]);
    assert.ok(spec.paths?.["/robots"]);
    assert.ok(spec.paths?.["/sitemap"]);
  });

  it("GET /docs serves Scalar reference", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/docs");
    await expectOk(res, "docs");
    const html = await res.text();
    assert.match(html, /scalar|openapi/i);
  });

  it("GET /read returns markdown from stable fixture", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/read", {
      params: { url: FIXTURE_URL.stable, format: "markdown", cache: "bypass" },
    });
    await expectOk(res, "read markdown");
    const text = await res.text();
    assert.ok(text.length > 200);
    assert.match(text, /example|domain/i);
    assert.equal(res.headers.get("x-final-url"), FIXTURE_URL.stable);
  });

  it("GET /read?format=json returns structured content", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/read", {
      params: { url: FIXTURE_URL.stable, format: "json", cache: "bypass" },
    });
    await expectOk(res, "read json");
    const json = (await res.json()) as { metadata?: { url?: string }; content?: unknown[] };
    assert.equal(json.metadata?.url, FIXTURE_URL.stable);
    assert.ok(Array.isArray(json.content) && json.content.length > 0);
  });

  it("GET /read with classify+marker emits READER comments", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/read", {
      params: {
        url: FIXTURE_URL.features,
        format: "markdown",
        classify: "true",
        marker: "pricing,date,link",
        cache: "bypass",
      },
    });
    await expectOk(res, "read markers");
    const text = await res.text();
    const hits = [...text.matchAll(MARKER_RE)];
    assert.ok(hits.length >= 3, `expected READER markers in output, got ${hits.length}`);
  });

  it("GET /graph returns JSON-LD (stable, no Wikidata)", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/graph", {
      params: { url: FIXTURE_URL.stable, wikidata: "false", cache: "bypass" },
    });
    await expectOk(res, "graph");
    assert.match(res.headers.get("content-type") ?? "", /json/);
    const doc = (await res.json()) as { "@context"?: unknown; "@graph"?: unknown[] };
    assert.ok(doc["@context"]);
    assert.ok(Array.isArray(doc["@graph"]) && doc["@graph"].length >= 1);
  });

  it("GET /graph on features may link Wikidata entities", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/graph", {
      params: {
        url: FIXTURE_URL.features,
        wikidataLimit: 2,
        wikidataClaims: "false",
        cache: "bypass",
      },
    });
    await expectOk(res, "graph wikidata");
    const raw = await res.text();
    const doc = JSON.parse(raw) as { "@graph"?: Record<string, unknown>[] };
    const graph = doc["@graph"] ?? [];
    const hasWdNode = graph.some(
      (n) =>
        String(n["@id"] ?? "").includes("wikidata.org") ||
        String(n["sameAs"] ?? "").includes("wikidata.org"),
    );
    const linkedHeader = res.headers.get("x-wikidata-linked");
    assert.ok(
      hasWdNode || (linkedHeader !== null && Number(linkedHeader) > 0),
      "expected Wikidata linkage in graph or X-Wikidata-Linked header",
    );
  });

  it("GET /diff compares snapshots (first adds, second unchanged)", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const url = `${FIXTURE_URL.stable}?_reader_test=${Date.now()}`;
    const params = {
      url,
      format: "json",
      cache: "bypass",
      update: "true",
    };
    const first = await apiFetch("/diff", { params });
    await expectOk(first, "diff first");
    const d1 = (await first.json()) as { summary?: { added?: number; unchanged?: number } };
    assert.ok((d1.summary?.added ?? 0) > 0, "first diff should record new blocks");

    const second = await apiFetch("/diff", { params });
    await expectOk(second, "diff second");
    const d2 = (await second.json()) as { summary?: { added?: number; unchanged?: number } };
    assert.equal(d2.summary?.added ?? -1, 0);
    assert.ok((d2.summary?.unchanged ?? 0) > 0, "second diff should show unchanged blocks");
  });

  it("GET /diff?format=unified returns plain diff text", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/diff", {
      params: { url: FIXTURE_URL.stable, format: "unified", cache: "bypass", update: "false" },
    });
    await expectOk(res, "diff unified");
    const text = await res.text();
    assert.match(text, /^@@/m);
    assert.ok(res.headers.get("x-diff-added") !== null);
  });

  it("GET /robots returns parsed robots.txt", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/robots", {
      params: { url: FIXTURE_URL.robotsOrigin, format: "json", cache: "bypass" },
    });
    await expectOk(res, "robots");
    const json = (await res.json()) as { rules?: unknown[] };
    assert.ok(Array.isArray(json.rules));
  });

  it("GET /sitemap discovers a sitemap for Cloudflare docs", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/sitemap", {
      params: { url: FIXTURE_URL.sitemapOrigin, format: "json", cache: "bypass" },
    });
    await expectOk(res, "sitemap");
    const json = (await res.json()) as { sitemapUrl?: string; urls?: string[] };
    assert.ok(json.sitemapUrl?.includes("sitemap"));
  });

  it("POST /read accepts JSON body", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: FIXTURE_URL.stable,
        format: "text",
        cache: "bypass",
      }),
    });
    await expectOk(res, "POST /read");
    const text = await res.text();
    assert.ok(text.trim().length > 50);
  });

  it("GET /read?format=toon returns toon content-type", async (t: TestContext) => {
    if (!up) return t.skip("dev server not running");
    const res = await apiFetch("/read", {
      params: { url: FIXTURE_URL.stable, format: "toon", cache: "bypass" },
    });
    await expectOk(res, "read toon");
    assert.match(res.headers.get("content-type") ?? "", /toon/i);
    assert.ok((await res.text()).length > 10);
  });
});
