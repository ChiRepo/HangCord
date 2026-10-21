#!/bin/sh
# Rebuild HangCord's code graph into graphify/graph (local parsing only — no AI model, no network).
#
#   sh graphify/refresh.sh            rebuild (npm run graph)
#   sh graphify/refresh.sh --check    rebuild into a temp folder and fail if the committed graph is stale
#                                     (npm run graph:check — CI runs this)
#
# Needs Graphify, pinned in graphify/requirements.txt:  uv tool install graphifyy==0.9.93
#                                                   or: pipx install graphifyy==0.9.93
set -eu
cd "$(dirname "$0")/.."

PINNED=$(sed -n 's/^graphifyy==//p' graphify/requirements.txt)
command -v graphify >/dev/null 2>&1 || { echo "graphify not found — install it: uv tool install graphifyy==$PINNED" >&2; exit 1; }
HAVE=$(graphify --version 2>/dev/null | awk '{print $2}')
if [ "$HAVE" != "$PINNED" ]; then
  echo "graphify $HAVE found but $PINNED is pinned (graphify/requirements.txt) — other versions build a different graph." >&2
  echo "Fix: uv tool install --force graphifyy==$PINNED" >&2
  exit 1
fi

# Privacy guard: the graph must never point at the private folders or secret files.
guard() {
  if grep -oE '"source_file": *"[^"]*"' "$1/graph.json" | sed 's/^"source_file": *"//; s/"$//' | grep -v '\.example$' \
     | grep -Eq '^(Private files \(\.md files store here\)|private and only to be accessed once)|(^|/)(\.dev\.vars|\.env)(\..+)?$|\.(pem|key)$'; then
    rm -f "$1/graph.json" "$1/graph.html" "$1/GRAPH_REPORT.md"
    echo "FAIL: the graph picked up a private or secret file — outputs deleted. Check .graphifyignore." >&2
    exit 1
  fi
}

if [ "${1:-}" = "--check" ]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  GRAPHIFY_OUT="$tmp/graph" graphify update . --force >/dev/null
  guard "$tmp/graph"
  # Compare structure only: community numbering depends on earlier local runs; the report and HTML carry a date.
  if ! python3 graphify/compare.py "$tmp/graph/graph.json" graphify/graph/graph.json; then
    echo "FAIL: graphify/graph is out of date — run 'npm run graph' and commit graphify/graph/." >&2
    exit 1
  fi
  echo "Code map is up to date."
  exit 0
fi

export GRAPHIFY_OUT=graphify/graph
# --force: always mirror the code exactly, including deletions and renames.
graphify update . --force "$@"
guard graphify/graph
echo "Graph ready: graphify/graph/GRAPH_REPORT.md · graphify/graph/graph.html"
