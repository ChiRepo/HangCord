# graphify/ — HangCord's code map

A knowledge graph of the HangCord codebase made with [Graphify](https://github.com/Graphify-Labs/graphify)
(`graphifyy` on PyPI, pinned to **0.9.93** in `requirements.txt` — other versions build a different graph). Agents use it to find where things live and what a change touches
**before** opening files — fewer guesses, fewer tokens.

| File | What it is |
|---|---|
| `graph/GRAPH_REPORT.md` | Plain-language summary: hubs ("god nodes"), communities, surprising links. Read this first. |
| `graph/graph.html` | Interactive map — open it in a browser (loads vis-network from unpkg). |
| `graph/graph.json` | The graph itself; the CLI commands below read it. |
| `refresh.sh` | Rebuilds the graph (`npm run graph`); `--check` fails if the committed graph is stale (`npm run graph:check`, CI job `code-map`). |
| `compare.py` | Used by `--check`: compares two graphs by nodes and edges (community numbering can differ between machines). |
| `requirements.txt` | The pinned Graphify version. |
| `hooks/pre-commit` | Optional git hook that refreshes the map on every commit (`npm run graph:hook` after `git init`). |
| `agent-skill/SKILL.md` | A small Claude Code skill (`hangcord-code-map`) that tells agents how to use the map. Copy it to `.claude/skills/hangcord-code-map/SKILL.md` (remote tools can't write `.claude/`). |

The graph is built from code **and** the public docs (`docs/`, `AGENTS.md`, `README.md`, `ui-ux/`), parsed locally
with tree-sitter. No AI model and no network are used, so it costs no tokens and sends nothing anywhere.

## Never in the graph
Both private folders, `.dev.vars*` / `.env*` / key files, `node_modules`, `target`, `dist`, `gen`, `.claude/`
and this folder. `.graphifyignore` (repo root) lists them, Graphify also obeys `.gitignore`, and `refresh.sh`
deletes the outputs and fails if a private or secret path ever shows up. A policy test checks it too.

## Use it from an AI agent (MCP — recommended)
`.mcp.json` (repo root) registers **`hangcord-code-map`**: Graphify's local MCP server over stdio, reading
`graphify/graph/graph.json` only — no network, no keys. Claude Code and other MCP clients pick it up when the
project opens (approve it once). Tools: `query_graph`, `get_node`, `get_neighbors`, `get_community`,
`god_nodes`, `graph_stats`, `shortest_path`; resources: `graphify://report`, `graphify://god-nodes`,
`graphify://surprises`. (`list_prs` / `triage_prs` call GitHub through `gh` — pushes happen only when the owner asks, so
agents don't use them unprompted.)

## Use it from the terminal (repo root)
```sh
export GRAPHIFY_OUT=graphify/graph          # tells every graphify command where the graph lives

graphify query "how does the desktop cache encrypt data"   # BFS over the graph (--budget N to widen)
graphify explain "planNewRoom"                              # one symbol and its neighbours
graphify path "useCachedHangout" "EncryptedStore"           # shortest link between two things
graphify affected "parseBits"                               # what breaks if this changes
graphify god-nodes --top 15                                 # the core abstractions
```
If a name is ambiguous (exit code 3), repeat it as `path/to/file::Name`.

## Keep it fresh
- After every change set and before every push: `npm run graph` (~2 s; it always mirrors deletions and renames).
  Commit `graph/graph.json`, `graph/graph.html` and `graph/GRAPH_REPORT.md` with the code they describe.
- CI's `code-map` job runs `npm run graph:check` on every push/PR and fails if the map is stale.
- Optional: `npm run graph:hook` (after `git init`) installs a pre-commit hook that does the refresh for you.

Install once: `uv tool install graphifyy==0.9.93` (or `pipx install graphifyy==0.9.93`). Python 3.10+.
`refresh.sh` refuses to run with any other version.

## Rules for agents
- Treat the graph as a map, not the truth: open the file before editing; the code wins if they disagree.
- Don't run the full `/graphify` assistant pipeline or `graphify extract` with an LLM backend — it sends
  file contents to a model. The local `refresh.sh` is all this project needs.
- Never point Graphify at the private folders, never pass `--no-gitignore`, never add an API key for it.
