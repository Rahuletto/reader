# Reader

[![skills.sh](https://skills.sh/b/Rahuletto/reader)](https://skills.sh/Rahuletto/reader/reader-fetch)

Hosted API that turns URLs into clean markdown (or JSON) for AI agents and scripts. No browser to run, no HTML cleanup on your side.

**https://reader.marban.lol** · alias **https://r.marban.lol** · [docs](https://reader.marban.lol/docs)

## How agents should read a page

Raw `curl` on a URL usually returns HTML full of chrome, ads, and scripts. Reader strips that and returns what you actually need to reason about the page.

**1. Install the skill** (so the agent reaches for Reader by default):

```bash
npx skills add Rahuletto/reader@reader-fetch -g -y
```

**2. Fetch markdown** (default). URL must be encoded:

```bash
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://example.com/docs/guide" \
  --data-urlencode "cache=bypass"
```

Use the response body as context. Check `X-Final-URL` if redirects matter for citations.

**3. Pick the right shape**

| You need | Do this |
|----------|---------|
| Summary, Q&A, quotes, code review of a doc | `format=markdown` (default) |
| Tables, lists, block-level logic | `format=json` |
| Minimal tokens | `format=text` |
| People, products, orgs linked to Wikidata | `GET /graph?url=...` |
| “What changed on this page?” | `track=true` on `/read`, then `GET /diff?url=...` |

**4. Narrow noisy pages**

```bash
# Only the main column
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://example.com/post" \
  --data-urlencode "selector=article"

# Machine-readable block types (pricing, dates, links, …)
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://example.com/pricing" \
  --data-urlencode "classify=true" \
  --data-urlencode "marker=pricing,link"
```

**5. Workflow the agent should follow**

1. User gives a URL (or the task implies one).
2. Call Reader `/read` with `cache=bypass` unless a slightly stale copy is fine.
3. Read markdown (or JSON) from the body; do not parse HTML yourself unless `format=raw`.
4. Cite `X-Final-URL` when quoting or linking back.
5. If the page is huge, use `selector` or `format=text` before stuffing everything into context.

Installable skill (Cursor, Claude Code, Codex, etc.): [`skills/reader-fetch/SKILL.md`](skills/reader-fetch/SKILL.md) · `npx skills add Rahuletto/reader@reader-fetch -g -y`

## Quick example

```bash
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://www.iana.org/help/example-domains"
```

## Routes

| Route | Notes |
|-------|-------|
| `GET /` | Metadata and usage hints |
| `GET /read` | Extract a URL |
| `POST /read` | Extract with JSON body |
| `GET /{url}` | URL in path, options in query |
| `GET /graph` | JSON-LD + Wikidata |
| `GET /diff` | Snapshot diff |
| `GET /robots` | Parse robots.txt |
| `GET /sitemap` | Resolve sitemap |

### `/read` params

| Param | |
|-------|-----|
| `format` | `markdown` (default) `json` `html` `text` `toon` `raw` |
| `selector` | CSS scope |
| `cache` | `default` `bypass` `force` |
| `classify` | Type tags on blocks |
| `marker` | `<!-- READER:type:id -->` wrappers |
| `track` | Save snapshot for `/diff` |

Headers: `X-Final-URL`, `X-Upstream-Status`, `X-Redirect-History`, `X-Cache`

## Local dev

```bash
npm install
npm run dev   # http://localhost:8787
```

```bash
npm run check
npm run dev && npm test   # integration tests need a running worker
```

`READER_BASE_URL=https://reader.marban.lol npm test` hits production.

## Deploy

```bash
npm run deploy
```

KV binding `CACHE` in `wrangler.jsonc` powers caching and diff snapshots. `npm run cf-typegen` after binding changes.

## Layout

```
skills/reader-fetch/   agent skill (skills.sh)
src/reader.ts          fetch → extract → format
src/routes/
```
