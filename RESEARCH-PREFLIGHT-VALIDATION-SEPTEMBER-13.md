# Research preflight validation — September 13, 2026

**A real early-validation regression is fixed. The selected native suite now has
one existing failure, down from three; the overall browser goal stays OPEN.**
This increment makes no website requests and does not rerun historical captures.
It restores correct native research behavior before an invalid target can cause
unnecessary navigation or receipt handling.

## Root cause and behavior

CSS generated-content support correctly broadened the shared selector parser to
accept before/after pseudo-elements. Research preflight reused its default CSS
mode even though --selector and --section require DOM-element targets. Invalid
research pseudo targets consequently proceeded into navigation instead of
failing before setup. The two existing selected research-section failures were
symptoms of this shared contract mismatch, not waived tests.

The validator now has an opt-in pseudoElements:false mode that examines parsed
target nodes, not selector substrings. Navigation arguments/direct calls, replay
arguments and direct JSON replay use it. They reject legacy/double-colon,
case-variant, escaped and mixed-list pseudo targets using existing static errors.
Literal colon text in attributes and escaped identifiers remain valid. Default
CSS validation, generated-style matching and DOM query semantics stay unchanged;
link-search text is not misclassified as CSS. Contract: RESEARCH-ELEMENT-PREFLIGHT.md.

## Actual native gates

| Gate | Result |
| --- | --- |
| Corrected baseline02 | 751pass/42fail/0skip;38new missing-preflight failures plus4existing preflight failures |
| Fixed02 focused | **793pass/0fail/0skip**,9suites |
| New feature suite | **55pass**, including no-setup/no-admission assertions |
| Restored existing research-selector suite | **118pass**, now also strictly compiled |
| Broad selected native gate | **19764pass/ONE unchanged failure/TWO unchanged skips** |
| Selection | 383suites/382strict roots/748manifest entries;365not selected |
| Build/strict/formatter | Pass; stable source inputs |

The broad increase is55new cases,118previously unselected existing cases, and
the two previously failing selected research-section cases now passing. The
restored suite contains two more preflight regressions which also now pass;
these were not part of the old selected total. No new skips or exclusions.

The independent focused audit verifies all six attempts and proves that final
baseline02/fixed02 have identical test files and differ only in the four intended
production files. All42failing assertions in that final baseline become passing
without changing their names or tests. FOCUSED-AUDIT.json and
FOCUSED-RECEIPTS.sha256 retain the original outcomes; focused ledger
7d9b98dbb5b578f50a493168fb9a478e51048cc47f903c9d9c93d01bb5223991.

The remaining actual failure is table-source's negative string assertion that
matches a globally preserved id. Existing focus-provisioning-pressure host-object
ceiling and media-fallback-layout skips are unchanged. The native command still
exits1, so the suite is NOT GREEN. The audit requires the exact remaining failure
and unchanged skips; it does not rewrite them as successes.

Full run 2026-09-13T14:31:52.308Z through
2026-09-13T14:36:24.384Z. Audited runtime:
native-research-element-preflight-september13-round00/snapshot01/dist.
Base: 974a3bbca0ef0af3becf242f3f05bfd2370613f0.
Source/config files: 1289; compiled files: 2124;
unchanged tracked inputs: 1282.
Source ledger: bfc81f3308a3d35766e6b3911ac7a8bdf51af9d87364378edaec3d83925d917f.
Compiled ledger: 6bec295291cc5a30586ce6de68e0229e13f356e49a67bb818701aab536689ce6.
Native result: ab00eab64613fad8aeb2217a5f68bb074d0d1733d089981813173372b109c61f.
Summary: 495b006f93311f79b04f5f785e0e3e7c1203be7e7cc1963c1be703fcf7a215cb.
AUDIT.json/RECEIPTS.sha256 bind exact source/compiled files and outcomes.
Cache paths in this report are relative to node_modules/.cache/native-validation/.
Root dist is not rebuilt; only declared owned changes are overlaid on the prior
audited snapshot, with unrelated dirty root work excluded.

## Restored suite and preserved unsuccessful attempts

The old research-selector suite had13 strict errors from accessing matches on
the wider selection union. Explicit css-selector discriminant guards now prove
the intended variant without casts, suppressed diagnostics or removed assertions.

Executing it exposed four stale expectations from earlier committed features:
the reader now retains source IDs but still strips classes, and resource-limit
failures now include structured diagnostics. The ID case verifies exact Body
extraction; the class case stays not-found. Depth cases retain strict equality
and verify document.depth/reader.depth,128levels and first rejected depth129.
The large decoded-source case verifies reader.decoded,2000000code units and the
constructed source's full observed length. No production limit or ID semantics
was changed here, and the suite retains all118cases.

Original baseline00:747pass/46fail; fixed00:789pass/4fail. Follow-up
baseline01:750pass/43fail; fixed01:792pass/1fail. That last failure was a test
expectation naming the later reader.source sanitizer gate rather than the earlier
reader.decoded load gate. The final pair corrects only that expected kind;
strict diagnostic equality remains. All snapshots/logs retain their original
outcomes. See research-preflight-work-september13/PRESERVED-ATTEMPTS.md.

## Website and research boundaries

These are manifest-listed isolated native tests: synthetic transport requests
are mocked, and denied real network/process facilities remain guarded. No live
websites, raw research-body extraction, real credentials, pass, profiles,
SafeJS, devices, socket self-probes or TTY/PTY checks ran. Passing preflight does
not establish that the selector matches, selects one heading, or yields content.

The latest actual website inventory remains
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FOURTH-UPDATE.md. Existing W3C and
TestPages observations are not relabeled as new positioning/preflight-build visits.
RESEARCH-STATUS-SEPTEMBER-13.md records a separate local audit of all four original
research topics: useful hardware/methodology evidence and a small historical
Astra post sample exist, while no verified Reddit/Poe opinion sample is established.
The audit does not authenticate or freshly verify external claims.

OPEN: remaining native failure, full-page rendering/CSS/script/resource support,
reproducible performance comparisons, broader website/crawler/challenge behavior,
four-topic research gaps and independent credential/passkey/device/TTY/socket/
SafeJS gates. This fix avoids bad-input traffic; it is not CAPTCHA bypass.
No push, new dependency or browser impersonation. Prior dirty work and historical
reports remain preserved.
