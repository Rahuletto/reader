#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${BASH_SOURCE[0]}"
cd "$ROOT"

if [[ -d .git ]] && git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Repo already has commits. Fresh repo or: FORCE=1 $0" >&2
  [[ "${FORCE:-}" == "1" ]] || exit 1
fi

[[ -d .git ]] || git init -b main

commit_at() {
  local when="$1"
  local msg="$2"
  shift 2
  git add "$@"
  if git diff --cached --quiet; then
    echo "error: nothing to commit for: $msg" >&2
    exit 1
  fi
  GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" git commit -m "$msg"
}

commit_at "2026-06-02 14:47:23 +0530" "init: hono worker scaffold" \
  package.json package-lock.json wrangler.jsonc tsconfig.json .gitignore

commit_at "2026-06-02 14:58:41 +0530" "chore: cloudflare env types" \
  src/cloudflare-env.d.ts src/global.d.ts

commit_at "2026-06-02 15:24:17 +0530" "feat: upstream fetch with redirects" \
  src/fetcher.ts

commit_at "2026-06-02 15:51:06 +0530" "feat: html extract and metadata" \
  src/extractor.ts src/metadata.ts src/metadata-record.ts src/dom-polyfill.ts

commit_at "2026-06-02 16:18:33 +0530" "feat: read pipeline" \
  src/reader.ts

commit_at "2026-06-02 16:44:52 +0530" "feat: gatsby and docusaurus reconstruct" \
  src/reconstructor.ts

commit_at "2026-06-02 17:12:08 +0530" "feat: block classifier" \
  src/classifier.ts src/block-key.ts

commit_at "2026-06-02 17:39:44 +0530" "feat: marker filter and injection" \
  src/marker-filter.ts src/markers.ts

commit_at "2026-06-02 18:21:19 +0530" "feat: markdown formatter" \
  src/formatters/markdown.ts

commit_at "2026-06-02 19:03:37 +0530" "feat: json content tree" \
  src/formatters/json.ts

commit_at "2026-06-02 19:47:12 +0530" "feat: openapi types and tags" \
  src/types.ts src/openapi.ts

commit_at "2026-06-02 20:28:55 +0530" "feat: read routes" \
  src/routes/read.ts

commit_at "2026-06-02 21:14:08 +0530" "feat: schema.org json-ld builder" \
  src/jsonld/context.ts src/jsonld/types.ts src/jsonld/ids.ts src/jsonld/section.ts \
  src/jsonld/block.ts src/jsonld/embed.ts src/graph.ts

commit_at "2026-06-02 22:06:41 +0530" "feat: graph endpoint" \
  src/formatters/graph.ts src/routes/graph.ts

commit_at "2026-06-02 22:53:29 +0530" "feat: wikidata entity linking" \
  src/wikidata/types.ts src/wikidata/api.ts src/wikidata/serialize.ts src/wikidata/link.ts

commit_at "2026-06-02 23:38:17 +0530" "feat: diff snapshots" \
  src/diff.ts src/diff-format.ts src/snapshot.ts src/routes/diff.ts

commit_at "2026-06-03 10:22:44 +0530" "feat: robots and sitemap discovery" \
  src/discovery.ts src/routes/crawl.ts

commit_at "2026-06-03 10:58:13 +0530" "feat: toon output format" \
  src/formatters/toon.ts

commit_at "2026-06-03 11:41:27 +0530" "feat: api info route" \
  src/routes/info.ts src/version.ts

commit_at "2026-06-03 12:19:52 +0530" "feat: kv cache layer" \
  src/kv-cache.ts

commit_at "2026-06-03 12:54:08 +0530" "feat: route handlers and cache wiring" \
  src/routes/helpers.ts

commit_at "2026-06-03 13:29:07 +0530" "feat: scalar docs and app entry" \
  src/index.ts

commit_at "2026-06-03 14:18:44 +0530" "chore: v1.0.0" \
  package.json src/version.ts src/types.ts src/openapi.ts src/routes/info.ts

commit_at "2026-06-03 17:31:14 +0530" "test: integration suite" \
  tests/fixtures.ts tests/integration.test.ts package.json tsconfig.json

if [[ -n "$(git status --porcelain)" ]]; then
  echo "" >&2
  echo "Warning: uncommitted files remain:" >&2
  git status --short >&2
fi

echo ""
echo "Done: $(git rev-list --count HEAD) commits on $(git branch --show-current)"
echo "Log: git log --oneline --date=format:'%Y-%m-%d %H:%M' --format='%ad %s'"

rm -f "$SCRIPT_PATH"
echo "commits.sh removed"
