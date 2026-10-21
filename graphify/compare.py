"""Compare two Graphify graph.json files by structure (nodes + edges), ignoring community numbering.

Community ids/names depend on earlier local runs (Graphify reuses previous clustering), so two
correct graphs of the same code can number communities differently. Used by refresh.sh --check.
Exit 0 = same structure, 1 = different (prints a short summary).
"""
import json
import sys

DROP = {"community", "community_name"}


def norm(path):
    g = json.load(open(path, encoding="utf-8"))
    nodes = sorted(json.dumps({k: v for k, v in n.items() if k not in DROP}, sort_keys=True) for n in g.get("nodes", []))
    links = sorted(json.dumps(l, sort_keys=True) for l in g.get("links", g.get("edges", [])))
    hyper = sorted(json.dumps(h, sort_keys=True) for h in g.get("hyperedges", []))
    return nodes, links, hyper


a, b = norm(sys.argv[1]), norm(sys.argv[2])
if a == b:
    sys.exit(0)
for name, x, y in zip(("nodes", "edges", "hyperedges"), a, b):
    added, removed = len(set(x) - set(y)), len(set(y) - set(x))
    if added or removed:
        print(f"  {name}: {added} new or changed, {removed} gone", file=sys.stderr)
sys.exit(1)
