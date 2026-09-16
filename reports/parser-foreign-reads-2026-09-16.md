# Namespace-only parser dispatch: measured reader-load improvement

## Result

Avoid immutable attribute snapshots when the parser only needs a namespace or
can rule out a template from its stack entry. Ten identical saved pages retain
the same serialized reader HTML, resource usage and normalized extraction.
Every page has a lower candidate median in both independent local comparison
processes: **5.0–21.6% lower reader-load time** in forward order and **6.0–20.5%**
in reverse order. Combined load/extraction reductions are4.9–16.6% and4.7–16.1%.

These are warmed, local native reader timings. They do not include networking,
startup or a rendered/scripted application, and are not new website-access or
CAPTCHA results. No output, visibility, access or resource limit is weakened.

## Evidence-led change

A V8 profile of150 load/extract/close iterations across five saved pages records
6532 samples over6.857 seconds. Attribute snapshots on foreign-context and
insertion-target paths account for about0.646 seconds of sampled self time.
Sampling identifies a useful target; it is not an exact allocation census.

- `HtmlForeign.currentNamespace()` uses the existing namespace-only tree read,
  or the original virtual fragment context at the root. There is no new cache.
- Tokenizer CDATA dispatch and ordinary HTML foreign-dispatch checks use that
  read instead of copying attributes. Actual foreign processing still obtains
  the original full context, including MathML encoding/integration decisions.
- Insertion-target selection skips element information when the stack tag cannot
  be a template. A possible template still receives the actual HTML-element
  check, preserving virtual template fragment roots and SVG lookalikes.

The production patch touches only `src/html-foreign.ts` and `src/html-parser.ts`.
Document snapshots, native namespace policy, error/work accounting, cancellation
and close behavior remain unchanged. See `PARSER-FOREIGN-READS.md`.

## Validation

- Baseline and production-only candidate:1206pass/0 in24 explicit manifest files.
- Final: **1236pass/0 in25 files**, including30 new regressions. The exact new
  tests against old production yield13pass/17fail, retained as a red control.
- New checks cover snapshot avoidance, current namespace/context agreement,
  live stack changes, invalid/closed IDs, prototype-safe attributes, real/virtual
  templates, SVG/MathML integration, CDATA, breakout, limits and cancellation.
- Build, selected strict types, scoped formatter and lint pass. The final build's
  2292 artifact hashes exactly match the benchmarked production candidate; six
  compiled artifacts differ from baseline, all belonging to the two parser files.
- Unit tests use a JavaScript network guard, not a kernel sandbox. Profiling and
  both comparison processes separately have kernel-denied network and no TTY.
  Every observed process/group closes without a forced signal; HOME/TMP stay empty.

This is not the full941-file committed native manifest, an actual SafeJS run,
credential/passkey/device test or live website validation.

## Same-response comparison

Each of two processes loads ten complete saved responses in opposite page order.
For each runtime/page, one untimed control compares retained serialized HTML,
resource usage and extraction metadata, followed by four warmups and twenty
measured independent load/extraction calls. Baseline/candidate order alternates.
Every call's extraction matches the control after normalizing only generated
node-reference strings. Both processes open and close500 documents each.

| Saved page | Forward load reduction | Reverse load reduction |
| --- | ---: | ---: |
| CNET cellular home-internet article |15.8%|18.4%|
| RunRepeat Brooks Revel9 review |14.8%|15.3%|
| KBB Subaru Ascent review |16.4%|17.6%|
| Cambridge homepage |18.0%|19.7%|
| Ulta homepage |12.7%|12.3%|
| Target product |5.0%|6.4%|
| Ulta product |12.9%|13.5%|
| App Store NFL listing |5.6%|6.0%|
| Cambridge enormous definition |21.6%|20.5%|
| GitHub Requests source file |11.7%|11.8%|

The adjacent JSON includes exact URLs, input/output hashes, medians, raw timing
samples, runtime/host information and evidence pins. Figures are rounded; no
claim is made that every workload benefits equally or that these independent
processes represent broad hardware or production distributions. Source content
is not fact-checked anew, and historical live results remain unchanged.

## Scope and remaining work

The clean candidate derives from committed
`1535b4b813b8f583ef3d8e1cc28fcb16f0bf0b29`, not dirty-root output. The final
source snapshot contains1519 committed source/script/config inputs including
the new test. No runtime dependency is added. Pre-existing uncommitted work is
preserved, with only the new manifest entry and task section staged separately.

Artifacts are retained in
`node_modules/.cache/native-validation/reader-load-profile-september16/`.
There are zero new website requests. Further live functionality, dynamic runtime,
full rendering, access handoff and credential/device gates remain open; the
overall browser goal is active. No push occurs.
