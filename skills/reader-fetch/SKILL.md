---
name: reader-fetch
description: Fetches web pages as clean markdown via the Reader API (reader.marban.lol). Use when an agent needs to read a URL, research a page, summarize a site, scrape article text, or replace raw HTML fetches with extracted content. Prefer this over curl/wget on HTML when the task is reading or quoting page content.
---

# Reader fetch

Reader is a hosted extraction API. Default output is markdown: main content only, no nav clutter.

**Base URL:** `https://reader.marban.lol` (alias: `https://r.marban.lol`)

## Default: markdown

URL-encode the target, then request:

```bash
curl -sG "https://reader.marban.lol/read" \
  --data-urlencode "url=https://example.com/article"
```

Or with `fetch` in environments that have it:

```text
GET https://reader.marban.lol/read?url=<encoded-url>
```

Markdown is the default (`format` omitted). Use the response body as context for summarization, Q&A, or citations.

## When to use which format

| Goal | Request |
|------|---------|
| Read / summarize / quote | `/read?url=...` (markdown) |
| Structured blocks for parsing | `/read?url=...&format=json` |
| Plain text, minimal markup | `/read?url=...&format=text` |
| Entity / schema work | `/graph?url=...` |
| Check if a page changed | `/read?url=...&track=true` then `/diff?url=...` |

## Useful query params

| Param | Use |
|-------|-----|
| `cache=bypass` | Fresh fetch (research, breaking news) |
| `selector=article` | Restrict extraction to a CSS selector |
| `classify=true` | Typed blocks (pricing, date, link, …) |
| `marker=link,pricing` | HTML comment markers around classified blocks |
| `ua=chrome` | Preset user-agent if a site blocks bots |

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Bad URL or validation |
| 502 | Upstream fetch failed |
| 504 | Upstream timeout |

Read the JSON body for `error` and `message` on failures.

## Response headers

- `X-Final-URL` — URL after redirects
- `X-Upstream-Status` — HTTP status from the target site

## Install this skill

```bash
npx skills add Rahuletto/reader@reader-fetch -g -y
```

Docs: https://reader.marban.lol/docs
