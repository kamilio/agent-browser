# Source headings and practical website content — September 17, 2026

## Result

The browser now has opt-in `source-aria-heading-v1` support in native extraction,
heading discovery, section selection, reader retention and research capture/replay.
Default native `h1`–`h6` behavior is preserved. This is explicit authored-source
interpretation, not rendered accessibility or JavaScript execution.

The initial experiment found that **existing whole-document legacy source mode
already recovered 5,544 Markdown bytes from the saved Best Buy response**. The
previous visibility-filtered result was 43 placeholder bytes. This improvement
does not invent a new 5.5 KB recovery mechanism: it makes that source content
better structured and navigable, while retaining its limitations.

Best Buy's source span heading previously ran directly into the following body
text. The new policy emits a separate level-two heading and paragraph. Its full
saved-source output becomes 5,549 bytes, still including unresolved template
text. Ordinary filtered storefront rendering remains unqualified.

## Saved-source checks

These are zero-network controls of earlier native captures, not fresh visits:

| Source | Default outline | Opt-in outline | Added source headings |
| --- | ---: | ---: | ---: |
| Best Buy | 0 | 1 | 1 |
| Wikipedia Main Page | 11 | 14 | 3 |
| Bankrate | 22 | 45 | 23 |

An independent Python HTML parser matches the **27 source titles, levels and
explicit-versus-default level basis** in order. Wikipedia's added headings are
language-group labels; many Bankrate headings are navigation labels, including
repeated “Get guidance.” These are not 27 newly retrieved articles.

All 27 discovered selectors are then replayed as individual native heading
sections. Each resolves uniquely, preserves the target's title/level/provenance,
and closes its document. This checks a practical discovery-to-section workflow,
not just counts. No network request occurs during these replays.

Baseline and final default Markdown compare byte-for-byte on all three sources.
Default outlines preserve titles, levels, selectors, revision and budget fields;
node references are compared relative to the document root because additional
opt-in runs advance process-global node allocation. The original records are
not rewritten.

## Three fresh native requests

All use the tested release02 runtime with explicit **legacy source visibility**,
source headings, raw-text separation, UTF-8 fallback and compact table output.
They do not claim visible-only or rendered-page content.

| Page | UTC start, September 17 | HTTP | Decoded body bytes | Markdown bytes | Native elapsed |
| --- | --- | ---: | ---: | ---: | ---: |
| Wikipedia Main Page | 03:27:05.844 | 200 | 253,104 | 57,301 | 142 ms |
| Bankrate landing | 03:27:08.231 | 200 | 1,292,150 | 24,409 | 141 ms |
| Best Buy landing | 03:27:10.626 | 200 | 435,138 | 5,549 | 379 ms |

All three outcomes remain `extracted-unverified`; source prices, offers and facts
are not independently verified. The Best Buy heading/body separation is present
in its fresh output. The timings are individual observations, **not a controlled
speedup comparison**. Whole CLI process times are approximately 0.38, 0.39 and
0.63 seconds, respectively.

Three exact compiled-command synthetic proofs precede live use. There is one
anonymous GET per site, no retry, and no redirect under the test-only policy.
Production retains its existing bounded redirect behavior. Requests, TLS sockets
and child process groups close; HOME/TMP remain empty. No credentials, page
scripts, SafeJS SDK, alternative browser/client, identity changes or CAPTCHA
solver are used. Access failures would remain failures, not trigger bypasses.

## Validation and review

- **2,374 passed / zero failed across 20 distinct selected native files**,
  including **188 new cases in four new test files**. Build, strict selected
  types, formatting and lint pass in the protected clean-HEAD-plus-patch build.
- Canonical manifest: **984 entries, 962 available, 22 still missing**. This is
  not a full-manifest pass or acceptance of the pre-existing dirty workspace.
- Tests cover native defaults, mixed outlines/sections, namespace/visibility,
  literal-source refusal, bounded malformed/oversized levels, six-marker
  Markdown limits, high-level long-profile capture, metadata agreement and
  replay. Heading text does not acquire secret/control values or source labels.
- Reader review caught malformed `aria-level` being stripped and inadvertently
  becoming a missing-level default. The final reader preserves bounded malformed
  spelling for rejection and suppresses the candidate role for oversized levels.
- First staged validation records 1,269 passing / 21 failing tests and lint
  failures. Fixes correct routed-fixture accounting, expected HTML CR-to-LF
  normalization and test lint. A new test filename initially collided with an
  existing committed suite; the original file is restored byte-for-byte, new
  tests use a distinct filename, and the final run includes both suites. The
  failed initial evidence is retained, not presented as a successful gate.
- The first independent outline comparison failed on allocation-dependent IDs;
  a separately retained second audit compares document-relative references and
  records that normalization explicitly.
- An independent static integration review found no further actionable defect
  in its inspected scope. It ran during integration and is not an independent
  execution or blanket approval of the final staged runtime.

## Still open

This is not rendered storefront/feed support, a CAPTCHA solution, or a new
100-site sweep. Historical citation-proxy verdicts remain **33 useful / 67 other**.
Actual SafeJS 0.1.640 execution, broader dynamic-site compatibility, measured
performance comparisons, real credential/passkey/device/TTY acceptance, missing
manifest tests and unfinished hardware/benchmark/Astra/Poe research remain open.
The overall browser goal stays active.

Usage and precise policy grammar: `SOURCE-ARIA-HEADINGS.md`. Adjacent JSON records
measured results and evidence hashes. Private execution evidence:
`node_modules/.cache/native-validation/source-headings-september17/`.
