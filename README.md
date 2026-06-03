# Reader

[![skills.sh](https://skills.sh/b/Rahuletto/reader)](https://skills.sh/Rahuletto/reader/reader-fetch)

Hosted API that turns URLs into clean markdown (or JSON) for AI agents and scripts. No browser to run, no HTML cleanup on your side.

**https://reader.marban.lol** · alias **https://r.marban.lol** · [docs](https://reader.marban.lol/docs)

## For agents

Give your agent the `reader-fetch` skill so it knows to call Reader instead of pulling raw HTML:

```bash
npx skills add Rahuletto/reader@reader-fetch -g -y
```

Then a typical read is:

```bash
curl -sG "https://reader.marban.lol/read" --data-urlencode "url=https://example.com/article"
```

You get article markdown back. Use `cache=bypass` when the page must be fresh. Use `format=json` when you need structured blocks instead of prose.

| Task | Call |
|------|------|
| Read / summarize / cite | `GET /read?url=...` |
| Structured extraction | `GET /read?url=...&format=json` |
| Typed blocks + markers | `&classify=true&marker=link,pricing` |
| Knowledge graph | `GET /graph?url=...` |
| Page changed since last visit | `GET /read?url=...&track=true` then `GET /diff?url=...` |

In Cursor, Codex, Claude Code, or any agent with the skills CLI: install once, and the agent should prefer Reader whenever the job is "open this URL and understand it."

Skill source: [`skills/reader-fetch/SKILL.md`](skills/reader-fetch/SKILL.md)

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

Hono · linkedom · Turndown · Scalar
