---
name: hangcord-code-map
description: Use before searching or editing HangCord code, or when asked where something lives, what calls it, or what a change would break. Queries the local Graphify code map in graphify/graph.
---

# HangCord code map (Graphify)

The repo has a prebuilt knowledge graph of its code and public docs in `graphify/graph/` (see `graphify/README.md`).
Use it to find the right files first, then open only those.

1. Read `graphify/graph/GRAPH_REPORT.md` once per session (hubs and communities).
2. If the `hangcord-code-map` MCP server is connected (`.mcp.json`), use its tools: `query_graph`, `get_node`,
   `get_neighbors`, `shortest_path`, `god_nodes` (not `list_prs`/`triage_prs` — only when the owner asks).
   Otherwise, from the repo root with `export GRAPHIFY_OUT=graphify/graph`:
   - `graphify query "<question>" --budget 2000` — what is related to a topic
   - `graphify explain "<Symbol>"` — one symbol and its neighbours (file + line)
   - `graphify path "A" "B"` — how two things connect
   - `graphify affected "<Symbol>"` — what a change touches (run before editing shared code)
   - Exit code 3 means the name is ambiguous: retry as `path/to/file::Name`.
3. Open the files it points to before editing. If code and graph disagree, the code is right.
4. After every change set: `npm run graph` (CI's `code-map` job fails on a stale map).

If `graphify` is not installed: `uv tool install graphifyy==0.9.93` (pinned in `graphify/requirements.txt`).

Never: point Graphify at the two private folders, pass `--no-gitignore`, run the full `/graphify` assistant
pipeline or `graphify extract` with an LLM backend (that sends file contents to a model), or add an API key for it.
