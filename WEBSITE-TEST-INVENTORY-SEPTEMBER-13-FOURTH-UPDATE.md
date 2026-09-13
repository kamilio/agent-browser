# Website checks — September 13, 2026, fourth update

This supplements `WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRD-UPDATE.md` without
rewriting earlier evidence. These are two new URL checks on previously attempted
hosts, not two new hosts or two fully working websites.

## Actual native visits

| URL | Retrieval, UTC | Observed outcome |
| --- | --- | --- |
| `https://github.com/mlcommons/inference_policies/blob/master/inference_rules.adoc#3-scenarios` | September13,04:38:32 | One GET200; policy heading outline; original fragment unmatched |
| `https://en.wikipedia.org/wiki/Large_language_model#Evaluation` | September13,04:39:53 | One GET200; original fragment resolves to the Evaluation heading; full-document outline |

Both probes forward the original fragment-bearing input unchanged to the actual
native transport. Actual HTTPS paths omit the fragment. Neither uses an alternate
browser, rewritten URL, retry, redirect, mock response, script or asset request.
Credentials are omitted and saved response metadata omits Set-Cookie values.
No login, device, SafeJS, realTTY or challenge-solving operation occurred.

Both reuse the audited17741 runtime from code59fa3b0, not a dirty-root rebuild.
Before/after source and compiled inventories match1250/2076 files. The earlier
broad gate is not rerun by these website probes. Single observed navigation
times,528ms for GitHub and293ms for Wikipedia, are not controlled performance
benchmarks and do not establish a speed improvement.

## GitHub: readable policy, unmatched original anchor

The native heading outline contains Scenarios, Closed Division and Open Division.
One socket-sealed offline native parse/query confirms that the requested
`3-scenarios` has no exact source ID or named anchor. Source IDs instead include
`user-content-scenarios` on a heading and `user-content-3-scenarios` on an anchor.

The result is **partial functionality**, not successful anchor navigation. No
GitHub-specific alias, script execution or guessed alternative was introduced.
Whether the interactive frontend maps the original link remains untested. An
additional wrapper heading says Uh oh!; readable policy content does not prove
that every GitHub component worked. Live reader refs and offline raw-tree refs
belong to different trees.

The bounded offline extraction retains16 heading groups and9527 excerpt code
units, including selected link text/URLs. Thirty-four other content-bearing
groups are explicitly omitted. Selected rules distinguish scenario-specific
latency/throughput metrics, reference-model constraints, Open-division reporting,
dataset restrictions, reproducibility and anti-gaming requirements. These are
project policy statements, not proof of enforcement or benchmark execution.

The captured policy names Closed, Network and Open divisions; the previously
visited submission guide names two divisions. Their version relationship and
current-round applicability are unverified. Detailed audit/model-eligibility
tables and most Network clauses are outside this extraction. Earlier model-level
eligibility inconsistencies remain unresolved. The mutable master URL does not
establish the latest policy or pin an upstream commit.

## Wikipedia: target and section work, content fidelity remains partial

The live reader resolves the fragment to Evaluation at ref e5976 and discovers
64 headings without cap-triggered truncation. Default output remains a
full-document outline; it does not silently restrict extraction to the fragment.

One socket-sealed offline raw parse creates17744 nodes. After explicitly setting
the document URL and selecting its native target, `:target` resolves to h2 with
ID Evaluation at ref e6900. This is a new raw-tree ref, not a reused reader ref;
parsing alone is not navigation. Two bounded native queries use47328 recorded
query work units. Heading-section extraction scans6426 nodes, selects348 and
retains7562 Markdown bytes, stopping before Limitations and challenges. It covers
six headings and discovers39 labeled, resolved links; none is followed.

**Content fidelity is incomplete:** the reader reports29 omitted math subtrees.
The retained section output contains missing inline mathematical symbols and
does not preserve the displayed perplexity formula. Successful target selection,
non-truncated output and readable surrounding prose do not prove mathematical
content preservation. Math/text alternatives need separate compatibility work;
no mathematical or visual rendering is tested here.

The saved-source diagnosis is distinct from reader omission: in the raw source,
MathML is inside display:none wrappers and fallback images are aria-hidden.
Raw extraction excludes both representations. MATHEMATICAL-LOSS.md/JSON records
the formula and inline-symbol source/output comparison without another parse or
request. A fix must not globally weaken hidden/inert/aria-hidden admission just
to make this one page's formulas appear.

Reader diagnostics also report missing-doctype and quirks-layout-not-implemented
for its projection, not necessarily the original HTML. No scrolling, interactive
navigation, general rendering or encyclopedia reliability claim is established.
Response Date and Last-Modified headers describe September12; actual retrieval
occurred September13. Neither proves the latest article revision.

## Evidence and boundaries

Lanes under `node_modules/.cache/native-validation/`:

- `native-mlperf-policy-september13`: RESULT.md/JSON, live transport audit,
  original response, offline anchor diagnosis and EXCERPTS.md/JSON.
- `native-wikipedia-language-model-september13`: RESULT.md/JSON, live/offline
  receipts, SECTION-CONTENT.json, SECTION-LINKS.json, MATHEMATICAL-LOSS.md/JSON
  and cleanup records. The initial narrower semantic-only summary is preserved
  separately; the final verdict explicitly includes mathematical-content loss.

Captured decoded-body SHA256:

- GitHub: `9ee4273d6dca5ff6ed34b4666d64d63f1e69858b7d189434c9499c9a5b7b4e06`.
- Wikipedia: `d245314a28881a374410f72c84cc496cbe9b00e67d4716f4b237b7ecf0890705`.

Pinned runtime inventory SHA256:

- Source: `2b5ea24f9737336de7bea3f3ec27b8c5ddcf8984820a84577b68d42ce2658e5c`.
- Compiled: `5d0ea3dcf82b04cc368f422d1278529842949c20954370a67674df1dccd3f1cb`.

Live limits: one navigation, at most one same-origin redirect,3MiB decoded body,
10MiB output and30s plus5s termination grace. No redirect occurred. Both offline
phases prohibit network access. Owners close and runtime inventories remain
unchanged; actual process termination/private-directory cleanup is recorded.
Original admission and prior failure artifacts remain untouched.

Separately, corrected heading/section HTTP429 expectations and16 new cases pass
496/0/0 focused native checks: `RESEARCH-RATE-LIMIT-COVERAGE.md`. This test-only
change does not alter production or close website/challenge-handoff gates.
Hardware, benchmark, Astra and Poe research remain incomplete overall.
