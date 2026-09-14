# Website inventory: September 14 twenty-fourth update

This append-only update covers **three previously tested hosts, four captured
attempts, zero new hosts and zero live requests**. It adds current native
functionality evidence outside Wikipedia; it does not establish current site
availability, challenge bypass or whole-site acceptance.

All checks use audited runtime `39b55d996feb7af5320e3a1d575821743477b475` with
documentation-only HEAD `cc2466ce6ce6fa4707c0cede7adef65cab4f09bf`. Original
September 11–12 captures, historical reports and earlier measurements remain
unchanged. Only this native browser interprets the captured website content.

## Actual attempts

| Host | September 14 native UTC | Actual outcome |
| --- | --- | --- |
| `news.ycombinator.com` | 14:04:46.426–14:04:46.659 | Initial document commits; native “More” anchor found. Geometry fails with remaining CSS, presentation-hint, image and overflow guards. No click. |
| `man7.org` | 14:09:09.314–14:09:09.325 | First harness eagerly initializes the image owner. Native loader rejects duplicate configuration before commit. This is a harness failure, not a site-layout result. |
| `www.zlib.net` | 14:09:12.503–14:09:12.593 | Eight captured responses replay, then uncaptured `madler-email.png` is denied before transport. No commit or click. This is an incomplete-corpus limit, not a demonstrated browser regression. |
| `man7.org` | 14:14:05.778–14:14:06.626 | Separately scoped instrumentation retest commits ls(1), discovers date(1), and makes one genuine click attempt. Native percentage table sizing blocks it before destination transport. |

Across the four attempts: **15 accepted mocked responses, 171,934 decoded replay
bytes, four initial navigations, two initial document commits, one click attempt
and zero destination commits**. No wire requests, scripts, forms, rasters,
credential/provider/passkey/device access, SafeJS or real terminal probes occur.
The man7 tracker is a retained local optional-image policy denial, not another
visited host or a server-side access block. The zlib missing response is also a
local denial. Neither is evidence of a CAPTCHA or Cloudflare challenge.

## What changes the next action

**man7 now exposes a specific native layout blocker.** After correcting only the
premature image-owner observation, initial loading succeeds: 722 nodes, title
“ls(1) - Linux manual page”, four original responses / 39,562 decoded bytes.
Native discovery inspects 64 anchors and finds date(1), e472. One ordinary
BrowserSession click returns `unsupported` with
`Percentage table role sizing requires cycle resolution`.

Applicable CSS issues are empty. The formatting inspection has only three table
coordination shells; the failure advances beyond the generic formatting-profile
guard seen historically. The source guard is in `src/table-layout.ts`, and
existing percentage-table fixtures already exercise it. The next implementation
priority is genuine percentage table sizing with correct containing-block and
intrinsic-cycle handling, not suppressing the guard. The absent date(1) capture
remains an independent future limit, not the failure reached in this check.

**Hacker News still has broader rendering gaps.** Compared with the exact-input
September 12 cell-spacing replay, overlapping formatting occurrences fall
145→135: invalid CSS values 11→2 and unsupported properties 2→1. Current native
samples identify `word-break:break-word` on 61 title links and layered URL/gradient
background declarations on 30 vote arrows. Table hints, table-cell overflow and
image limitations remain. Native “More” anchor e1261 exists but lacks supported
geometry. The comparison spans intervening feature work, not opacity alone.

**zlib needs a complete fixture before a complete flow can be judged.** Its
72,703 replay bytes reproduce the known eight-response corpus boundary. Do not
spend another identical replay trying to infer layout from this loading stop,
increase an old capture's recorded allowance, or invent the missing image.

These observations and work counters are not a performance benchmark. No speed
or memory improvement is claimed from their short elapsed times.

## Reports and evidence

- HN-CURRENT-CAPTURED-DIAGNOSTICS-SEPTEMBER-14.md: diagnostic verified, geometry
  unsupported; 24 original evidence entries and 26 final entries verified.
- MAN7-CURRENT-CAPTURED-FLOW-SEPTEMBER-14.md: first harness failure retained;
  original verifier remains **17 passed / 1 failed**, with 49 sealed entries.
- MAN7-OWNER-RETEST-SEPTEMBER-14.md: actual click/layout failure retained;
  **18 metadata/cleanup checks pass**, with 57 sealed entries. The workload's
  sole behavioral change removes the premature image-owner lookup; seven
  framework files are byte-identical to the first attempt.
- ZLIB-CURRENT-CAPTURED-FLOW-SEPTEMBER-14.md: incomplete-corpus outcome verified,
  not site acceptance; 49 sealed entries match.

Independent parent audits verify all four results and original evidence seals,
preserving failed verdicts. The parent corrected two metadata-audit path-handling
mistakes while checking the first man7 ledger; neither changed evidence or ran a
browser. HN's first metadata preparation also corrected a gate-result filename
before launch, as its report records. No stale post-seal stdout is introduced.

Byte-identical durable copies retain original paths inside their receipts:

| Evidence directory under `node_modules/.cache/native-validation/` | Copied scope |
| --- | --- |
| `hn-current-september14/` | 27 then-existing lane files, 78,398 bytes; copied 14:10:23.727 UTC. |
| `man7-current-september14/` | 50 lane files plus original report, 2,817,843 bytes; copied 14:14:18.474 UTC. |
| `zlib-current-september14/` | 49 lane files plus original report, 374,806 bytes; copied 14:14:18.478 UTC. |
| `man7-owner-retest-september14/` | 58 lane files plus retest report, 2,958,235 bytes; copied 14:19:24.426 UTC. |

PERSISTENCE.json records each copy, not another execution. Parent scope, audit
and adoption metadata are preserved separately in the multisite lane. The
previously completed 23,757-pass / two-exclusion native gate and all 2,925 source
and 2,200 compiled inputs were rehashed, **not rerun** for these observations.
No production source or test behavior changed in this reporting increment.

The overall browser goal remains active. New live-site coverage, the original
research topics, functioning provider/passkey/device acceptance, SafeJS and
challenge-handling validation remain separate open work.
