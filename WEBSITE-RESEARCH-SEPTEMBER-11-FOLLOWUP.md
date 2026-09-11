# Native website research follow-up — September 11, 2026

This historical report summarizes four completed, bounded investigations from
existing evidence only. Publication involved no new browsing, network access,
native operation, test, benchmark or acceptance probe. Completion of an
investigation does not mean its request, extraction or audit passed.

## Scope and evidence locations

All four investigations used fixed Node v22.22.0 and the native compiled browser
at `node_modules/.cache/native-validation/native-reader-raw-policy-september11-round02/snapshot01/dist/scripts/research-browser.js`.
They made **four live requests total**, one per assigned URL, with zero redirects
and no retries or followed links. Camoufox and quantization each added one local
section replay; RFC 9110 added three local operations. NVIDIA had no replay.
Local operations recorded zero network/API-guard attempts. No external browser,
search, credential, SafeJS execution, model or hardware workload was used.

Lane names below refer to these unchanged original locations:

| Lane | Existing evidence directory |
| --- | --- |
| Camoufox | `node_modules/.cache/native-validation/native-camoufox-reference-september11/` |
| Quantization | `node_modules/.cache/native-validation/native-quantization-reference-september11/` |
| NVIDIA | `node_modules/.cache/native-validation/native-dgx-spark-reference-september11/` |
| RFC | `node_modules/.cache/native-validation/native-http-retry-after-rfc-september11/` |

Each lane's `RESULT.md` supplies the detailed findings and evidence index.
Artifact names below are relative to the corresponding lane, not relocated files.

## Exact execution record

Every time in this table is **UTC on September 11, 2026**. Intervals are outer
execution records, except the quantization replay interval, which is its recorded
audit interval including integrity checks. They are not comparable benchmarks.

| Action | Start UTC | Finish UTC | Original exit | Outcome |
| --- | --- | --- | --- | --- |
| NVIDIA live | 05:40:30.959Z | 05:40:31.317Z | **1** | HTTP **404**; stopped |
| Quantization live | 05:40:35.762Z | 05:40:36.071Z | 0 | HTTP 200; heading discovery |
| RFC live | 05:40:47.906Z | 05:40:48.122Z | 0 | HTTP 200; Retry-After discovery |
| Camoufox live | 05:41:05.549Z | 05:41:06.343Z | 0 | HTTP 200; heading discovery |
| Quantization local replay | 05:42:04.150Z | 05:42:04.492Z | 0 | Hardware Compatibility section |
| RFC original local range | 05:42:38.194Z | 05:42:38.277Z | **1** | Text emitted; harness assertion failed |
| Camoufox local replay | 05:43:08.985Z | 05:43:09.224Z | 0 | Stealth Overview section |
| RFC authorized date discovery | 05:43:56.721Z | 05:43:56.804Z | 0 | Local HTTP-date discovery |
| RFC authorized date range | 05:44:16.534Z | 05:44:16.617Z | 0 | Local HTTP-date grammar extraction |

Sources: Camoufox `EXECUTION.json` and `REPLAY-EXECUTION.json`; quantization
`EXECUTION.json` and `REPLAY-AUDIT.json`; NVIDIA `capture/EXECUTION.json`; RFC
`live-EXECUTION.json`, `local-EXECUTION.json`, `date-discovery-EXECUTION.json` and
`date-range-EXECUTION.json`. Camoufox's native-only live interval is separately
05:41:05.622Z–05:41:06.327Z; its native replay interval is
05:43:09.012Z–05:43:09.210Z. RFC response receipt time is 05:40:48.101Z.

Successful HTTP captures remain `extracted-unverified`, `partial: true`, with
`contentSuccess: null`; process exit 0 does not promote them to verified content
or full website support. These are retrieval times, not publisher release dates.

## Camoufox: architectural inspiration, not a runtime dependency

Source: the README at `https://github.com/daijro/camoufox`, specifically the
observed Stealth Overview heading `e2778`, ending before Build System `e2959`.
`replay-extraction.jsonl` and its native-text projection `section-text.jsonl`
preserve the bounded section; `PINNED-SELECTION.json` preserves its selector.

The **publisher describes** a Firefox/Playwright/Juggler architecture, isolated
automation machinery and C++-level modifications rather than page-JavaScript
overrides (`e2799`–`e2805`, `e2915`, `e2939`–`e2954`). It distinguishes plausible
fingerprints from internally consistent identities and acknowledges mismatches
across OS/GPU, HTTP/JavaScript and window/worker surfaces (`e2863`–`e2918`). Its
captured warning also describes maintenance and detection limitations; these
were not independently assessed.

No Camoufox installation, code audit, fingerprinting measurement, CAPTCHA test
or bypass demonstration occurred. Camoufox is inspiration only, **not an
approved page-runtime dependency**. This standalone native engine must remain
independent of Firefox, Chromium and remote browsers; SafeJS remains the only
approved page-runtime dependency.

**Preserved audit failure:** `final-check-exit-code.txt` is **1**, and
`final-check.stderr` retains the failed whole-working-tree stability assertion.
The shared root acquired changes to `scripts/research-browser.ts`,
`src/research-admission-cli.test.ts` and an untracked `src/retry-after.ts`; the
lane reports leaving those files untouched. The separate corrected audit,
`final-check-round02-exit-code.txt`, is **0**. `FINAL-CHECK.json`, checked at
**2026-09-11T05:45:17.873Z**, explicitly records `rootStatusUnchanged: false`,
unchanged HEAD and verified snapshot/evidence. It did not repeat capture or
replay and does not validate the dirty root. The original `CLEANUP.json` null
`nativeTransport` convenience field is also retained; the corrected audit reads
the actual closed/zero-active counters from native `metrics`.

## Quantization: documentation claims, not measured hardware results

Source: `https://huggingface.co/docs/transformers/en/quantization/bitsandbytes`.
The sole replay selected Hardware Compatibility (`e638`); `replay.jsonl`
preserves the native table and text, and `REPLAY-INPUT.json` preserves its pins.

The **captured documentation lists** NVIDIA CUDA 11.8–13.0, Intel XPU, Gaudi HPU
and CPU support (`e646`). It pairs `LLM.int8()` with Turing-or-newer NVIDIA GPUs
(`e676`, `e678`) and NF4/FP4 with Pascal-or-newer GPUs (`e681`, `e683`). The
Pascal entry has an unexplained asterisk in this selected section. The listed
platforms include NVIDIA Linux x86-64/aarch64 and Windows; Intel XPU Linux and
Windows x86-64; Gaudi2/Gaudi3 Linux x86-64; and CPU Linux x86-64/aarch64 and
Windows x86-64 (`e659`, `e693`, `e703`, `e713`).

These mutable documentation claims establish neither tested feature parity nor
memory savings, speed, accuracy or model suitability. They are not benchmarks,
current pricing, a hardware ranking or a best-hardware recommendation. No linked
package or model was executed. The reader's missing-doctype/quirks diagnostics
describe its loaded subset, not a demonstrated original-site defect.
`FINAL-VERIFICATION.json` records a successful **offline** evidence check at
**2026-09-11T05:43:41.898Z**, explicitly without a native-suite run.

## NVIDIA DGX Spark: HTTP failure, no hardware findings

Assigned source: `https://www.nvidia.com/en-us/data-center/dgx-spark/`.
`SEMANTIC-EVIDENCE.json` records **HTTP 404**, only a 404 page heading,
`outcome: http-failure` and `contentSuccess: false`. The native classifier found
no barrier, but neither this nor a readable error page establishes evasion.
The native CLI and wrapper both exited **1**. No retry, alternative URL or
section replay followed; the captured error body was not promoted to replayable
hardware evidence.

No supported claims about memory, expansion, local-LLM capability, model sizes,
performance, pricing or product availability elsewhere follow from this page.
`OFFLINE-VERIFICATION.json`, checked at **2026-09-11T05:41:49.636Z**, passed
integrity/cleanup checks while explicitly retaining `replayAdmitted: false` and
zero replay calls. That audit pass does **not** turn the HTTP failure into success.

## RFC 9110: Retry-After and actual HTTP-date requirements

Source: `https://www.rfc-editor.org/rfc/rfc9110.txt`. Native Retry-After discovery
selected **lines 4799–4825** (27 lines; 16,000-byte output bound). The separately
authorized local date discovery selected **1830–1989** (160 lines; 20,000-byte
output bound), containing §5.6.7 at **1836–1937**. `NATIVE-EXCERPTS.md` renders
already emitted native semantic text, not a separate parser of the raw capture.

- §10.2.3 defines `Retry-After = HTTP-date / delay-seconds` and
  `delay-seconds = 1*DIGIT`: a non-negative integer delay in seconds after
  response receipt, or an absolute HTTP-date. With 503, it describes expected
  unavailability; with any 3xx, the minimum requested wait before redirecting.
- §5.6.7 requires timestamp-parsing recipients to accept IMF-fixdate and the
  obsolete RFC850/asctime formats; senders **MUST generate IMF-fixdate**. All
  represent UTC. IMF-fixdate/asctime use four-digit years; RFC850 uses two.
- Native lines **1891–1896** specify two-digit seconds and explicitly annotate
  `00:00:00 - 23:59:60 (leap second)`. Second 60 is recognized for leap seconds,
  not authorized at arbitrary times; fractional seconds are not in this grammar.
- Lines **1923–1926** require an RFC850 timestamp appearing **more than 50 years
  in the future** to mean the most recent past year with the same last two
  digits. This is not an “at least 50” threshold or a fixed century pivot.
- HTTP-date is case-sensitive, and senders must not add whitespace outside the
  grammar. The referenced cache relaxation and RFC5322 component semantics were
  not separately retrieved. Neither 429-specific requirements nor an automatic
  retry, clock-skew, integer-overflow or malformed-header policy was established.

**Preserved original failure:** `local-stdout.jsonl` contains native text followed
by `ERR_ASSERTION`: the harness expected an absent `extraction.truncated` property
to equal false. Its original **exit 1** remains in `local-EXECUTION.json`; it was
not retried or relabeled. The separately authorized date follow-ups retain their
own invocations, outputs and **exit 0** statuses with zero network attempts.
`AUDIT.json` keeps `allInvocationsPassed: false`. No RFC publication/revision
date was established by these ranges; example dates are not publication dates.

## Receipt and body identities

The following SHA-256 values are copied from retained pin/audit records, not
freshly recomputed during report publication. Body hashes cover transport-decoded
bytes. NVIDIA's hashes identify an error response, not product specifications.

| Lane / original receipt | Receipt SHA-256 | Body SHA-256 |
| --- | --- | --- |
| Camoufox `stdout.jsonl` | `8eb25c48394e75be32d66cff5520a2f96c8d080c7f2a1a8efbb612eed7a274d2` | `3cb9f2baa35ccabc3af52ab917b641cf2887788bc09cfb13e8095a56adc184fb` |
| Quantization `stdout.jsonl` | `b41b32a751985d0e94809d7cba0714ce28a2f87f1ddb875cddbe37ce42f7c676` | `6e995a7e0511b0a2014411b7ad5cdb52fcb52ac451111531083697c3ad7484f1` |
| NVIDIA `capture/stdout.jsonl` | `078ec83e2b5b413da0119d2842579696a8c99113c829e6196a83aaa4fb545b3c` | `c457a31245e5e879dc3e77baa4a62bed58f2c7a6a12c1880b92e8b924bfbfec6` |
| RFC `live-stdout.jsonl` | `ad1f79b0c914dab46ac55d66b6179d47b493e31b340599f378eb394eaebce91e` | `21c1cdce6ab0e5509b04d84a28000836c7a087cf786efe6f04877ebfff47232a` |

Pin sources: Camoufox `PINNED-SELECTION.json`, quantization `REPLAY-INPUT.json`,
NVIDIA `OFFLINE-VERIFICATION.json`, RFC `PINS.json`. Original stderr, exit-code,
invocation, integrity and cleanup artifacts remain in each lane. RFC's added
`date-range-stdout.jsonl` hash is
`13460cbdb7ca1ef81a767da428c07e50c0e48ad8d0f85b74d79c18b452467964`.

## Integrity boundaries and outstanding research

The recorded checks matched 988 frozen source files and 1,776 compiled files
before/after the relevant operations. They validate that snapshot's identity,
not the mutable working tree. Runs used clean environments, private home/tmp,
non-TTY operation, exclusive evidence files, 30-second outer timeouts with
five-second termination grace, 6 MiB output containment and unchanged native
budgets. Recorded live transports closed with zero active requests; local guards
and document/process cleanup are retained. These historical checks were not rerun
for this report and close no additional acceptance gate.

**The broader four-topic research remains incomplete:** Twitter/X Astra and
Reddit Poe opinions were not established by these investigations. Nothing here
supplies those missing findings, proves fingerprint/CAPTCHA effectiveness or
recommends the best hardware. This report does not alter the original evidence,
failures or historical reports; TASKS.md tracks the outstanding work separately.
