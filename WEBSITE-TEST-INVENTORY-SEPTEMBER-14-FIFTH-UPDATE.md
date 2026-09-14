# Website test inventory — September 14, fifth update

**Adds one passing expanded captured Python link-to-document flow.** It adds no
fresh HTTP request or newly contacted host. Earlier results remain unchanged in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-FOURTH-UPDATE.md` and its predecessors.

| Site/scope | September 14, 2026 UTC observation | Boundary |
| --- | --- | --- |
| Captured `docs.python.org/3/` to `docs.python.org/3/tutorial/index.html` | 04:41:05–04:41:06: native discovered click returns document navigation; replacement, old-document closure, title and h1 checks pass | Expanded nine-response offline corpus; no live-site or destination-rendering acceptance |
| Resource/cleanup checks | All 9 URLs used; 16 accepted requests, 161,647 served decoded bytes, zero denials or wire requests; 18 ledgers verified and process group `1278218` absent | Six CSS resources and one SVG repeat once per document phase; no unlimited replay or new assets |
| Performance observation | Native interval 1.279 seconds; peak RSS 214,488 KiB (about 209.5 MiB) | One two-document observation, not a benchmark or memory-target pass |

The new corpus explicitly adds the already retained September 13 Tutorial
response. Its total unique decoded size is 109,017 bytes. The preceding
eight-response run still has `flowPassed:false` at its uncaptured-destination
boundary; it is not rewritten as a successful run.

The engine stays pinned to the ownership snapshot at `23e988d`. No newer
capability code is adopted by this experiment and no native test gate is rerun.
Full source/guard bindings, exact evidence hashes and limitations are in
`PYTHON-TWO-PAGE-REPLAY.md`.

## Next Candidates, Not Executed Here

- **MDN original action corpus:** 19 retained responses / 270,288 decoded bytes
  from September 11. Rediscover the recorded `querySelectorAll()` destination
  from the `Document.querySelector` page and attempt one normal native click.
  The identified corpus lacks the destination response, so this is initially
  an actionability/first-blocker check, not complete two-page navigation.
- **MDN source-only distinction:** the newer September 13 border-style capture
  has 331,666 decoded bytes at its final redirected URL, but supplies no action
  destination or external stylesheets. It must not replace the original action
  corpus merely to obtain an easier result.
- **Performance:** investigate the measured memory footprint and repeated normal
  layout entry points in a separately scoped profile, before introducing caches
  or claiming speed improvements.

The MDN proposal comes from retained report/metadata inspection only; no new MDN
browser execution or reachability check occurred. Its precise handoff is
`node_modules/.cache/native-validation/mdn-next-check-work-september14/CANDIDATE.md`.
Live navigation, rendering, research, credentials/devices, SafeJS, socket, TTY
and challenge gates remain open. Overall browser goal stays **ACTIVE**.
