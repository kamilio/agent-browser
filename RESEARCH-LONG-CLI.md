# Explicit long-document research CLI

This checkpoint wires the already bounded `long-v1` profile into the native
research CLI. It does not replace the native engine, add runtime dependencies,
retry a historical request, execute page scripts or authorize a network probe.
The first-slice measurements in `RESEARCH-LONG-ADMISSION.md` remain historical.

## Explicit operation-local admission

The separated `--document-profile long-v1` flag requires exactly one public
HTTP(S) URL together with `--reader --capture-body --headings`. Selector, line,
section, find and full-extraction combinations reject before navigation. Missing,
duplicate, unknown and equals-spelled profile arguments reject. Omitted selection
keeps the legacy argument shape; explicit `default` retains legacy modes and
limits. No URL, header, environment value or receipt can implicitly select long.

`researchNavigation` appends its optional profile after the existing parameters.
It validates selection before using selection inputs or creating a session.
Long operations use the canonical network, document, reader, capture, heading and
deadline limits from `src/research-admission.ts`; default low-level call shapes
are preserved. GET-only policy, credential omission, challenge handoff, bounded
failure diagnostics and final session closure are unchanged.

The long network response and captured decoded body each cap at 4,000,000 bytes;
the session byte ceiling is 8,000,000. Navigation timeout remains 20 seconds,
request timeout 15 seconds and overall deadline 120 seconds. The inert reader
accepts HTML only in long mode. Its separate source, text, output, token, depth
and tree bounds still apply. Heading output caps at 256,000 bytes, 256 entries,
256 title code units and 4,096 selector code units. These are independent limits,
not a heap-size or complete-rendering guarantee.

## Receipts and output

Long reports carry exact frozen `admission` provenance: schema version 1,
explicit-host selection, `long-v1`, the complete effective profile and local
codec guards of depth 32 and 16,384 properties. The codec counts object fields
and array indices with the root at depth zero. Profile-bearing reports cannot
be serialized through omitted/default selection.

Long serialization snapshots bounded plain data without invoking getters,
proxies or `toJSON`. It counts escaped UTF-8 JSON plus the terminating LF, with
6,000,000 receipt bytes and 65,536 metadata bytes. Only captured base64 data and
heading entries are payload exclusions from metadata. Bounded unknown plain-data
extensions remain metadata, not authority. Structural work-limit errors are
local resource errors, not invented byte-overflow observations.

Byte overflow produces one bounded metadata-only failure, not a truncated JSON
fragment or recursive retry. The fallback omits the entire capture and heading
payloads, labels metadata projection, records the original overflow observation
and preserves bounded prior outcome/failure state. Returned byte counts describe
the emitted record; original overflow counts live in `outputLimit`. Oversized
prior failure details are explicitly omitted rather than silently truncated.
Invalid required identities never become fabricated fallback identities.

`emitResearchReport` writes the actual codec bytes once to a Writable and waits
for its callback, handling error and premature close without retry. Terminal
close retires per-emission listeners independently of callback success. Main
computes exit status from emitted effective outcomes, so a serialization fallback
cannot retain a successful navigation exit code. Output failures abort the run
and use a static error message. Omitted/default serialization remains compact
`JSON.stringify` plus LF without the new long-mode caps or projection.

A completed callback is not atomic filesystem publication, durable storage or
remote delivery. There is no output publisher or genuine TTY test in this scope.

## Independent replay admission

`validateResearchReplayAdmission` requires a separately supplied expected profile
and exact raw-receipt SHA-256, plus an independent body pin for capture readiness.
It owns a bounded ordinary Uint8Array snapshot, checks strict UTF-8 and one JSON
object, and binds long receipts to exact canonical admission. Long records use
compact single-line JSON plus LF; legacy object whitespace is not rewritten.
Neither self-declared receipt limits nor a missing authority field grants budget.

Returned original metadata excludes payloads and retains explicit field presence,
including legacy absent/null/false distinctions. Failures, omitted payloads,
missing capture/body pins and incomplete discovery return evidence-only results
without decoding or certifying capture bytes. Candidate captures pass the actual
profile-specific decoder and agree with the independent body pin, primary
response identity and final response URL. Long readiness additionally requires
HTML, untruncated heading discovery, no failure/barrier and inactive closed
transport metadata. Legacy missing readiness fields are not repaired.

This API validates byte admission, not source truth, currentness, successful
native extraction or genuine network provenance. Node/package/dist pinning and
any authorized offline extraction remain independent wrapper prerequisites.

## Validation and remaining gates

Validation uses an isolated dependency closure from committed
`aa80b77ef3e3528a475fabd8a6fad774b07c1b73`, excluding unrelated working changes.
The exact native scope has ten explicitly listed files, not the full manifest.
Evidence is under `node_modules/.cache/native-validation/research-long-cli/`.
Fixtures use
in-memory native parsing, extraction, stream consumption and real Writable
objects, with synthetic transport adapters and defensive codec boundary inputs.
No live HTTP/DNS/socket, TTY, SafeJS, credential provider, authenticator device or
account operation is included. No source result follows from synthetic tests.

On September 6, 2026, native02 records **1,121 passes and three unchanged failures
across ten files**, with zero pending cases, exit 1, at
`20:31:46.175134568–20:33:12.067427938 UTC`. All **239 new cases** pass: CLI 172
and evidence 67. Existing counts are admission 27, capture 138, headings 159,
output 34, lines 111, section 109, find 189 and selector 115 passes/three failures.
This is not a fully green ten-file run.

The unchanged selector test's three exact-object assertions do not account for
existing resource diagnostics. A separately authorized actual aa80b77 baseline
records the same three failure names/messages and 115 passes at
`20:30:43.881803235–20:30:45.703375127 UTC`, exit 1. The initial ten-file strict
check also reports thirteen TS2339 errors in that unchanged file; a compiler-only
baseline reproduces the normalized diagnostics exactly. The unrelated test is
not changed. Final production build, the explicitly narrowed **nine-file strict
check**, and five-file Biome check pass. Two formatter passes were used.

Setup01's twelve test lint findings and thirteen baseline type errors remain
preserved. Native01 records 1,118 passes/three identical selector failures at
`20:27:47.754975352–20:29:13.728971180 UTC`; its 236 new cases all pass. Before
final validation, independent review found replay accepted XHTML or duplicate
HTML Content-Type values that the actual long reader rejects. The fix uses the
reader's single-value, split/trim/case-normalized `text/html` rule. Two new
negative cases and one positive mixed-case/charset case pass in native02.

A separately authorized two-case control uses the actual preserved pre-fix
helper with otherwise identical source. Both cases fail specifically because
no rejection occurs, at `20:31:54.310557763–20:31:55.343504739 UTC`, exit 1; the
other 65 evidence cases are unselected. This is not an absent-API or mocked
decoder control. The writer review's terminal-clean-close issue is covered by
two real in-memory Writable cases with late success/failure callbacks. No real
stdout, OS-atomicity or durable-output claim follows.

The local audit verifies all five input ledgers (2,692/2,692/956/959/951 entries)
and four historical ledgers (108/78/28/33), current/tested source parity, and
the control's one-file difference across 954 source inputs. Runtime SHA-256:
CLI `ad6bc2b0a01bc9bbcd3297b78a81165c0845cc0432199ecdc9d64929fdd5ad61`;
evidence `9a28326347eb36fdf9461b75c7b7d316489615f69c94445f7eaff8c73a706fdf`.
Each native invocation has its own exact-scope authorization. One setup approval
review timed out; its single identical retry was approved before execution.

The published Level3 size failure and no-match draft query remain unchanged.
Fresh source admission requires a newly pinned build and separately authorized
proposal; frozen historical launchers are not modified. Attestation privacy,
actual device/page integration, blocked research sources, fingerprinting and the
full browser goal remain open with all existing stopped/denied gates intact.
