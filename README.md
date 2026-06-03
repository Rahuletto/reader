# Reader

[![skills.sh](https://skills.sh/b/Rahuletto/reader)](https://skills.sh/Rahuletto/reader)

Cloudflare Worker API that fetches URLs and returns extracted content for AI agents and scripts. Default output is markdown; also JSON, HTML, text, TOON, and raw upstream HTML.

**Production:** https://reader.marban.lol (short: https://r.marban.lol)  
**Docs:** https://reader.marban.lol/docs · **OpenAPI:** https://reader.marban.lol/openapi.json

## For agents

Install the skill so the agent uses Reader instead of raw HTML fetches:

```bash
npx skills add Rahuletto/reader@reader-fetch -g -y
```

Fetch a page (URL must be encoded):

```bash
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://example.com/article" \
  --data-urlencode "cache=bypass"
```

Use the response body as context. For citations after redirects, read `X-Final-URL`.

| Goal | Request |
|------|---------|
| Read, summarize, quote | `GET /read?url=...` (markdown default) |
| Structured blocks | `format=json` |
| Fewer tokens | `format=text` |
| Entities + Wikidata | `GET /graph?url=...` |
| Page changed since last time | `track=true` on `/read`, then `GET /diff?url=...` |

Workflow:

1. User provides a URL (or the task implies one).
2. Call `/read` with `cache=bypass` unless a cached copy is acceptable.
3. Use markdown or JSON from the body; avoid parsing HTML unless `format=raw`.
4. Cite `X-Final-URL` when quoting.
5. On large pages, try `selector=article` or `format=text` before filling context.

Skill source: [`skills/reader-fetch/SKILL.md`](skills/reader-fetch/SKILL.md). Listing page: [skills.sh/Rahuletto/reader](https://skills.sh/Rahuletto/reader) (layout in [`skills.sh.json`](skills.sh.json)).

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Service info, formats, example URLs |
| `GET` / `POST` | `/read` | Extract page content |
| `GET` | `/{encoded-url}` | Same as `/read`; target URL in path, options in query |
| `GET` / `POST` | `/graph` | JSON-LD (schema.org) with optional Wikidata links |
| `GET` / `POST` | `/diff` | Compare to a stored snapshot |
| `GET` / `POST` | `/robots` | Fetch and parse `robots.txt` |
| `GET` / `POST` | `/sitemap` | Resolve sitemap URLs (`expand=true` for indexes) |
| `GET` | `/docs` | Scalar API reference |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec |

### `/read` (main)

```bash
curl -sG "https://reader.marban.lol/read" --data-urlencode "url=https://example.com"
curl -sG "https://reader.marban.lol/read" --data-urlencode "url=https://example.com" --data-urlencode "format=json"

curl -X POST https://reader.marban.lol/read \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","selector":"article","ua":"chrome"}'
```

| Param | Values / notes |
|-------|----------------|
| `format` | `markdown` (default), `json`, `html`, `text`, `toon`, `raw` |
| `selector` | CSS selector to scope extraction |
| `cache` | `default`, `bypass`, `force` (upstream fetch) |
| `classify` | Tag blocks (pricing, date, link, …) |
| `marker` | Wrap classified blocks in `<!-- READER:type:id -->` |
| `track` | Store snapshot in KV for `/diff` |
| `links` | `inline`, `referenced`, `discard` (markdown) |
| `images` | `keep`, `discard`, `alt-only` |
| `frontmatter` | YAML frontmatter on markdown (default on) |
| `ua` | `chrome`, `googlebot`, `bingbot`, `firefox`, or custom string |
| `timeout` | Ms, 1000–30000 (default 15000) |

Response headers: `X-Final-URL`, `X-Upstream-Status`, `X-Redirect-History`, `X-Cache` (`HIT` / `MISS` when KV is bound).

### `/graph`

```bash
curl -sG "https://reader.marban.lol/graph" --data-urlencode "url=https://example.com"
curl -sG "https://reader.marban.lol/graph" --data-urlencode "url=https://example.com" --data-urlencode "wikidata=false"
```

Wikidata linking is on by default (`wikidataLimit`, `wikidataClaims` optional). Accepts the same fetch options as `/read` (selector, cache, ua, etc.) except `format`.

### `/diff`

Requires an earlier `/read` with `track=true` on the same URL (uses KV).

```bash
curl -sG "https://reader.marban.lol/diff" --data-urlencode "url=https://example.com" --data-urlencode "update=true"
curl -sG "https://reader.marban.lol/diff" --data-urlencode "url=https://example.com" --data-urlencode "update=false"
curl -sG "https://reader.marban.lol/diff" --data-urlencode "url=https://example.com" --data-urlencode "format=unified"
```

`update` defaults to true (refresh snapshot). `format`: `unified` (default), `json`, `markdown`, `text`.

### `/robots` and `/sitemap`

```bash
curl -sG "https://reader.marban.lol/robots" --data-urlencode "url=https://www.iana.org" --data-urlencode "format=json"
curl -sG "https://reader.marban.lol/sitemap" --data-urlencode "url=https://developers.cloudflare.com" --data-urlencode "format=json" --data-urlencode "expand=true"
```

`format` for these routes is `raw` or `json`, not the `/read` formats.

## Development

Requires Node 18+ and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
npm install
npm run dev          # http://localhost:8787
npm run check        # tsc (src + tests) + oxlint
npm test             # integration tests; skips if dev server is down
```

Run the worker and tests in separate terminals, or point tests at production:

```bash
READER_BASE_URL=https://reader.marban.lol npm test
```

| Script | |
|--------|---|
| `npm run lint` | oxlint |
| `npm run format` | oxfmt write |
| `npm run deploy` | `wrangler deploy --minify` |
| `npm run cf-typegen` | Regenerate `CloudflareBindings` after `wrangler.jsonc` changes |

## Deploy

Bind a KV namespace as `CACHE` in `wrangler.jsonc` (response cache + diff snapshots). Then:

```bash
npm run deploy
```

## Repository layout

```
skills.sh.json          skills.sh repo page (groupings)
skills/reader-fetch/    agent skill published to skills.sh
src/index.ts            Hono app, OpenAPI, /docs
src/reader.ts           fetch → extract → format
src/routes/             read, graph, diff, robots, sitemap
tests/integration.test.ts
```
