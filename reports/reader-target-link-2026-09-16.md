# Explicit native target-link selection

## Change

The maintained reader command now accepts `--target-link HTTPS_URL SOURCE_URL`
as an explicit alternative to `--target HTTPS_URL --selector CSS SOURCE_URL`.
It discovers exact-target anchors in the retained native document and chooses
the first eligible one in document order. It does not depend on a card's heading
level, title placement or CSS class, and tolerates duplicate image/headline
anchors. An exact known destination is still required; this is not search.

The old CSS mode keeps its uniqueness policy and report shape. Modes cannot mix.
Both preserve source/target URL policy, real native click, bounded output and
cleanup; no alternate link or direct navigation follows a failed click. New mode
caps retained anchors at10,000 and attribute/URL-qualified target candidates at64,
including candidates later rejected for empty/overlong text. It completes the
scan before selecting and exposes separate retained-anchor/target/eligible counts.
These are projected-reader checks, not proof about omitted source attributes.

## Validation

- Clean baseline commit: `c6b3edb59e4ca3c79f7c320886d454191982aa7e`.
  Final candidate overlays only the command and one new test file onto1516
  committed source/script/config inputs, with939 canonical native manifest files.
  The unrelated dirty root runtime is not used.
- Baseline and production-only core:621pass/0 in8 explicitly selected files.
  Final: **723pass/0 in9**, including102 new cases. The exact final tests against
  old production yield43pass/59fail, demonstrating the new behavior is exercised.
  This is selected native coverage, not the full939-file suite or SDK acceptance.
- Initial new-test run:722pass/1fail. The assertion incorrectly expected10,001
  native query results; the query's existing10,000-result bound throws first.
  Correct the test, preserve both runs, and leave production unchanged.
- Build, selected type-check, scoped formatting and lint all exit0. Static
  production review finds no blockers and matches the final production hash.
- Eight saved-source workflows pass: Business Insider, Good Housekeeping,
  Car and Driver, Bob Vila, IGN, two CarBuzz source variants, and CNET. Seven
  destinations are explicitly synthetic; only CNET replays a fully captured
  source/destination pair, reproducing its20,676-byte reviewed Markdown exactly.
  These are16 mocked requests, **zero new website requests**.
- Five actual compiled CLI preflight controls pass: help, missing source, mixed
  modes, cross-origin and synthetic userinfo rejection. Replays and CLI controls
  run with kernel-denied network; native unit tests use a JavaScript guard only.
  All test/check child processes and groups close without forced signals.

## Separate live check

At09:54:21.827865UTC on September16,2026, run one explicitly admitted new-mode
workflow from `https://carbuzz.com/` to
`https://carbuzz.com/mazda-sports-car-chassis-patent-sept-14/`.
Both native GETs return200. The source has291 retained anchors,2 exact-target
candidates and1 eligible text anchor. Its native click dispatches mousedown,
mouseup and click, then navigates to the exact target.

The result contains **12,245 Markdown bytes** across210 lines. A full line-by-line
comparison with the previously fully reviewed article leaves206 lines unchanged;
the four changed lines are two trailing related-article cards, all inspected.
The article itself remains available; these extra cards are not newly followed
links or independently verified article facts. The output SHA-256 is
`3e605e7c47c766655f272421e81b9da2f58bf9f320042af060bfb985f095e00e`.

All requests, sockets, documents and process groups close. Exactly2 new GETs,
zero retries/redirects/credentials/page scripts/alternate clients. The run uses
the clean final compiled candidate and hash-bound prior gates, a fresh lane's
single publisher allowance and the existing reviewed lifecycle supervisor.
It is not an automatic retry of the historical failed selector, and its2.46s
elapsed duration is not a general performance benchmark.

## Corpus and remaining work

The complete100-entry checklist remains in
`reports/agent-citation-revalidation-v2.md`, with exact URLs, individual reviews
and machine-readable JSON/CSV. Its33 useful/67 other verdicts are unchanged.
The list is a reproducible citation-derived host-root proxy, **not measured
global agent page popularity**. No100-site rerun is claimed for this feature.

Native success remains `extracted-unverified`, `contentSuccess:null` and partial.
The first policy-eligible link can still fail actionability; aria-label-only
anchors with empty text are still ineligible. Large scans are bounded, not
guaranteed fast or synchronously preemptible. Dynamic page behavior, full-source
rendering, access handoff, actual SafeJS, credentials/passkeys and real-input
acceptance remain separate open gates. See TASKS.md and RESEARCH-LINK-CONTENT.md.

The adjacent JSON records exact input/evidence hashes and retained failed runs.
Historical reports and website measurements are not rewritten.
