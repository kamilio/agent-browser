# Opt-in native research reader

## Definition-list depth accounting

The reader now accounts for optional `dt`/`dd` sibling endings instead of treating
long flat definition lists as progressively deeper nesting. The bounded backward
scan follows the native parser's definition-list special-element barriers;
ordinary non-reconstructing wrappers and explicitly closed inline children do
not accumulate false depth. A genuinely nested `dl` and block/list/table barriers
still retain their depth. Serialized sanitized bytes, omission reports and every
source/text/output/token/depth ceiling remain unchanged.

The scan stops conservatively at the native formatter's 14 formatting tags.
Discarding an open formatting ancestor would undercount a level the native parser
can reconstruct after a definition boundary. An independent static review found
that issue in the first candidate; the final change retains the prior accounting
for open formatting and tests both immediate and later explicit definition ends.
This is not a duplicate active-formatting engine or complete HTML depth model.
The final native parser/document depth guard remains necessary, and future changes
to the parser's formatting membership must update this conservative set too.

September 5, 2026 checkpoint: **62 new regression cases** and **482 passes across
eight named files in each tree**, with project types/builds, strict touched-test
types and scoped Biome passing. One formerly expected definition-list rejection
in the original loader suite is replaced by positive/negative coverage in the
new suite; optional-table rejection remains. The committed candidate manifest
has 438 entries; the working manifest has 440 because two separately pending
parent-RP tests remain uncommitted. Neither those tests nor the full manifest ran
in this matrix. No auth, SDK, socket, TTY or real-credential gate was exercised.

The corrected 32-case regression-first subset produced 11 failures under the
original reader; its exact baseline and intermediate test/formatting failures
remain preserved. The final set adds 30 formatting cases. Evidence uses
`reader-definition-final-` and `reader-definition-corrected-baseline-tests.*`
under `node_modules/.cache/native-validation/`; the clean candidate path is in
`/tmp/reader-definition-integrated-path`. The review and addendum are in
`reader-definition-review/REPORT.md` under the same cache.

Separate compatibility replay on September 5 at **06:15:56.410 UTC** used the
unchanged captured CSSOM body of 1,196,447 bytes, SHA-256
`0c344170f5e5ecc7ed4e69b82e07e73b7f96d88cd0c544577c26fb42bcf0fd8d`.
The already committed capture build and candidate produce identical sanitized
bytes, reports and native serialization, with 32,355 nodes each. The captured
receipt at **06:10:29.253 UTC** was already successful without this change; this
offline replay is not new live-candidate acceptance or evidence that the dt/dd
fix caused that prior success. `reader-definition-captured-replay.json` records
the comparison and both compiled loader hashes. No request was made by replay.

## Exact empty processing marker recovery

The reader now accepts only the complete three-character `<?>` marker already
classified by its tokenizer as an inert comment. It checks both token start and
end, omits the marker through the existing comment path and still records the
tokenizer issue. Nonempty instructions, larger bogus declarations ending in that
sequence, foreign CDATA ambiguity, unclosed/mismatched omissions and all source,
text, output, token and depth limits remain enforced. Raw/title text and decoded
literal markers are not reinterpreted. The ordinary native HTML parser is unchanged.

Twenty-six new regressions bring the loader suite to 100 cases. Six named suites
yield **330 passes in each tree**; types/builds, strict touched-test types and
scoped Biome pass. The manifest remains 436 entries; no full suite or denied
probe ran. Final integration logs use `reader-marker-final-` under
`node_modules/.cache/native-validation/`, with clean candidate path recorded in
`/tmp/reader-marker-path`.

One separately authorized native capture of the MDN creation-options page on
September 5, 2026, at **05:25:23.513 UTC** returned 169,283 decoded bytes. Its
SHA-256 `84d9aa7e6eef1cdf6c10a5d0dcc9f77055ba693370045b7e9c05e4affd5ad96d`
exactly matches the earlier failed research response. The original reader failed
again; four `<?>` markers caused that failure. Replaying the same preserved bytes
**offline** with the candidate reader produces the expected MDN title and 38,728
extracted code units while retaining four tokenizer issues and partial-reader
limitations. There was no second live request after the fix: this is not live
fixed-browser, WebAuthn-policy, SDK or rendering-parity acceptance.

Original failed capture, regression-first result (88 passed, 12 failed), raw
body, before/after source identities and offline replay remain under
`node_modules/.cache/native-validation/mdn-reader-diagnostic/`. The parent verified
all 33 saved artifact checksums. `PASSKEY-RP-POLICY-2026-09-05.md` retains the
earlier source-access failures unchanged.

## Regular CLI profile

`AGENT_BROWSER_DOCUMENT_PROFILE=reader` selects this loader when creating a native
CLI host; unset or `native` retains the normal loader. Existing services retain
their configured loader regardless of a client's environment. Reader mode rejects
explicit runtime, website-script and credential configuration settings before
resources are created. Mode options and configuration filenames are captured
before asynchronous connection lookup. This does not cache resolved passwords or
replace the providers' private-file checks. See `CLI.md` for launch instructions.

Plaintext extraction adds the fixed notice from returned reader provenance, not
from the client's requested profile. JSON serialization remains unchanged apart
from the actual reader metadata. Snapshot/search/text rendering uses the output
provenance behavior below; confidential acknowledgments are not annotated.

All **47 new profile cases pass**; seven named suites produce **360 passes in
each tree**, with project types/builds, strict changed-test types and scoped Biome
passing. The manifest has 433 entries; no full manifest ran. Results remain under
`node_modules/.cache/native-validation/cli-profile-final-*`. The parent retained
two failing candidate regressions in `cli-profile-race-before.json` / `.log`:
changing the host environment during connection lookup could substitute a later
secret-config filename. Capturing the validated settings fixes both cases. Only
mock boundaries were reached in that reproduction; no actual secret was read.
Worker baselines and its original 45-case run remain under `cli-reader/`.

### Separately authorized actual service/HTTP evidence

September 5, 2026, **04:40:32.747–04:40:34.082 UTC**: the clean candidate CLI ran
a fresh private loopback service in reader mode. Eight real CLI invocations
completed successfully: capabilities, open, JSON extraction/snapshot/search,
and plaintext extraction/snapshot/text. The single public navigation to
`https://example.com` returned HTTP 200, 559 bytes and the Example Domain document.
Its reader report records omitted link/meta/style roots and ignored hidden-content
semantics; this is static reading, not visual parity or website script execution.
Clients deliberately used the native profile, proving that output followed the
existing reader host rather than silently reconfiguring it.

The owned service exited with code 0 and no signal or forced kill. The parent
independently confirmed the new private runtime directory no longer existed and
all six recorded compiled artifacts matched both validated trees. The generated
local control token stayed in its private runtime file/internal CLI requests and
was not included in the report. No SafeJS, real account, credential provider,
route fulfillment, challenge solving or TTY/PTY was used.

Exact commands, stdout/stderr, timestamps, compiled hashes and cleanup evidence:
`node_modules/.cache/native-validation/cli-reader-service/attempt-1.json`;
independent checks: `parent-audit.json`; bounded authorized harness: `probe.mjs`;
scope: `PROBE.md`; integrity inventory: `SHA256SUMS`, all in that directory.
These are CLI outputs, not archived original HTTP bodies or pre-loader body
hashes. This separate narrow gate does not supersede earlier failures or prove
other services, pages, runtimes, platform passkeys or real-vault acceptance.

## Reader provenance in native outputs

September 5, 2026: snapshots, entry scans, structured/Markdown extraction and
snapshot searches now carry an optional immutable `reader` report. It identifies
the partial reader, disabled scripting/styling, ignored hidden-content semantics,
encoding, omission counts and original load-time budgets. It is whole-load
provenance, not a count recalculated for a scoped query or later DOM mutation.
Ordinary native documents retain their previous output shape without this field.

Plaintext snapshot/search renderers display a fixed partial-reader notice rather
than silently presenting hidden source text or omitted formulas as normal browser
semantics. Snapshot diffs reset if provenance changes; unchanged reports survive
JSON round trips without unnecessary resets. Metadata counts toward output byte
ceilings. Insufficient budgets reject instead of dropping the notice or returning
oversized metadata. This is not MathML/SVG support or rendering parity.

The report registry now lives in `src/research-reader-info.ts` to avoid importing
the HTML loader into output consumers. Existing loader exports of the report
type, profile and lookup function remain compatible. Publication detaches and
freezes omission counts, registers one cleanup owner and removes document lookup
on close. Retained historical output remains unchanged after close.

All **34 new cases pass**, including four in-memory command-host flows. Seven
named suites produce **190 passes in each working/isolated tree**, with project
types/builds, strict new-test types, scoped Biome and touched-output formatting
passing. The native manifest has 432 entries; it was not run in full. Results are
retained under `node_modules/.cache/native-validation/reader-output-final-*`.
The initial 25-case/four-suite run remains in `reader-output-initial-tests.*`.
A preflight rejected an unlisted text-loader suite before any tests ran; the
corrected list uses the already-listed document-loader suite, recorded in
`reader-output-preflight.md`. No live, SDK, credentials, socket or TTY gate ran.

## Optional paragraph/list depth correction

September 5, 2026: the reader's depth accounting now closes an immediately open
paragraph before a new paragraph or list item, and an immediately open list item
before its sibling. Long flat lists and paragraphs no longer consume false
nesting depth. Serialized output, omission accounting and all resource ceilings
remain unchanged; the native parser still determines the resulting tree.
Intervening wrappers and other optional end tags remain conservative limitations,
not a claim of complete HTML tree-builder parity.

All 32 new regression cases pass. Nine explicitly named suites produce **496
passes in each of the working and isolated trees**, with project types/builds,
strict reader-test types and scoped Biome passing. The manifest remains at 427
entries; it was not run in full. Evidence is retained under
`node_modules/.cache/native-validation/reader-optional-final-*`, with the worker's
before/final fixtures and failures under `reader-optional-closing/` in that cache.
The before-loader run has 12 failures among the final 74 reader cases; genuine
nested-depth and other budget failures remain rejected after the correction.
This is synthetic validation: no completed follow-up live-reader result is
available, and the previously recorded CSSOM resource-limit failures remain.

## Integrated checkpoint

September 5, 2026: **119 new cases** (39 reader, 80 challenge diagnostics) and
**287 passes across seven named suites in each tree**. Isolated and working
project types/builds, strict new-test types and scoped Biome pass. The explicit
native manifest has 418 entries; the full manifest was not executed.
Machine-readable results and logs are retained under
`node_modules/.cache/native-validation/research-reader-final-*`.

New authorized native browsing evidence, separate from the earlier research:

- Two initial restricted-network attempts failed before receiving responses;
  preserved in `browser-research/reader-parent-first.jsonl` under that cache.
- The approved retry at September 5, 2026, 02:43:20 UTC read Apple's Mac Studio
  specifications with HTTP 200, real chip/memory/bandwidth text and an explicit
  reader omission report. This is useful static extraction, not rendering parity.
- The same retry received HTTP 403 from the OpenAI announcement and a confirmed
  `cf-mitigated: challenge` signal. The runner stopped before parsing, retaining
  response status, byte counts and body hash. No challenge was solved or bypassed.
- Both retry records remain in `browser-research/reader-parent-escalated.jsonl`.
  Subsequent topic-agent rounds have their own timestamps and reports; they are
  not retroactively included in the original 76 attempts or these four probes.

The live runner/loader fingerprints used by these probes and round two remain
`81796a2323bc91be926677cb80ef1ba556e56bae390f21ffa0fe6a51e4204214`
and `ad7030bf078a15c179a4213f0049f40dc4b1660dfa9c86cae7bb16246599d496`,
respectively. Parent final builds are checked against those recorded bytes.

## Purpose and evidence boundary

`native-semantic-reader-v1` is an explicitly partial, static semantic reader for
public research/vendor pages whose inline SVG or CSS prevents the normal native
loader from reaching useful document text. It is not SVG/MathML support, rendering
compatibility, a script runtime, an alternate browser, or a remote-fetch service.
The normal native loader remains the default and is unchanged.

Round one remains separate historical evidence. The parent reported all four
research runs complete on September 5, 2026: **76 attempts**, comprising hardware
20, benchmarks 20, Astra/X 20, and Poe/Reddit 16. Useful documents were hardware
6 (including 5 primary), benchmarks 7 primary, Astra 2 search results with no
direct X access, and Poe 1 search result with no direct Reddit access. These are
not new reader measurements. The original `REPORT.md` / `BROWSER-BUGS.md` files
under `node_modules/.cache/native-validation/browser-research/` and their original
paths and measurements are not rewritten by this change.

## API and profile

- `src/research-loader.ts` exports `loadResearchDocument(response, context)`,
  directly usable as a `BrowserSession` document loader. It returns the native
  `DocumentTree`, not a replacement DOM.
- `sanitizeResearchHtml(source, lowerLimits?, signal?)` uses the existing native
  `HtmlTokenizer` to produce escaped, inert HTML and a frozen omission report.
  The resulting HTML is parsed by the existing native HTML parser.
- `researchReaderInfo(tree)` exposes the frozen report while the tree is open;
  closing the tree removes the report. `researchReaderProfile` and
  `researchReaderLimits` identify the profile and hard ceilings.
- `partial: true`, `scripting: false`, `styling: false`, and
  `hiddenContentSemantics: false` are deliberate profile promises. No script or
  stylesheet/image-fetch hooks are forwarded to the parser. The existing
  initialization callback is retained for native session ownership only.

The reader omits complete SVG, MathML, script, style, template, iframe, object,
canvas, legacy frame/fallback, audio and video subtrees. It also omits resource
links, metadata, embedded resources, inputs, and textarea contents. Omitted
subtree roots are counted by tag; skipped tokens, ignored attributes, unwrapped
elements, tokenizer issues, and source/text/output/token sizes are reported.
Nested markup inside an omitted root contributes to skipped tokens rather than
being counted as another independent omitted root. Omitted raw text still
consumes the text budget.

Native headings, paragraphs, lists, tables, anchor structure, ordinary text and
image alt text survive. Safe HTTP(S)/relative anchor and base URLs, anchor titles,
image alt text, and ordered-list starts are retained. Other attributes, including
style, event handlers, resource URLs, hidden/inert/ARIA hiding, and form actions,
are removed. Forms, details, dialogs and selected block containers become inert
divs; unknown wrappers are unwrapped. Raw `xmp` becomes escaped preformatted text;
title text and entities use native tokenization and decoding. Normal HTML encoding
precedence is BOM, HTTP charset, the bounded metadata prescan, then Windows-1252;
plain text and JSON use the native literal loader and its decoding rules.

Consequences: visually hidden text may appear, responsive navigation may repeat,
charts and equations disappear, and layout, visibility, accessibility and form
semantics are not reproduced. Existing native extraction itself is partial. A
reader result must never be presented as the rendered page or complete evidence
of a site's content. This is not a sanitizer for execution in another browser.

## Bounds and malformed input

The reader ceilings are 2,000,000 source code units, 1,000,000 text code units,
2,000,000 serialized output code units, 100,000 tokens, and depth 128. Callers may
only lower sanitizer limits. The loader also respects lower native document
limits and bounds encoded input before decoding. Native parser, document, CSS,
network and SSRF limits are not relaxed.

Omitted subtrees use a bounded, matched tag stack; malformed nesting or an
unclosed omitted root is rejected, never repaired by releasing its contents into
the retained document. Unterminated tokens/raw elements and unsupported bogus
declarations, including foreign CDATA, are rejected. The only declaration
recovery is the exact complete `<?>` marker described above; it remains an
omitted comment with a counted tokenizer issue. Optional-end-tag repair
inside omitted subtrees is not implemented. The retained-input depth budget is
conservative syntactic nesting, so repeated implicit closes can also hit its
limit even when a full browser would recover. Source/output expansion limits can
reject large, entity-heavy pages. These failures remain failures, not truncated
content successes.

## Research CLI

After the parent integrates and builds, use:

```sh
node dist/scripts/research-browser.js https://research.example/paper
node dist/scripts/research-browser.js --reader https://research.example/paper
```

These are invocation examples with a reserved synthetic host, not live evidence.
No shared `dist` build or live invocation is part of this change.

The CLI uses only `BrowserSession` and `NodeNetworkTransport`. It requires 1–8
explicit HTTP(S) URLs (maximum 4,096 code units each); private/literal local
addresses, embedded credentials, fragments, and unknown switches are rejected.
Native DNS/address/redirect policy remains active. Each URL gets a fresh session
and transport. The transport receives the session's cookie jar because native
request-context validation requires one, but every outbound request forcibly
uses `credentials: "omit"`, preserving its other context fields. The jar is not
read for outgoing cookies and response cookies are not stored, including across
redirects and stylesheet requests. There are no auth headers, credential loading,
runtime, state import, form submission, challenge retry, or automated login.
Requests are GET-only. The normal profile may fetch stylesheets through the
normal loader; the reader does not fetch subresources.

Per URL: one tab/navigation, 12 transport requests including redirect hops,
5 redirects per transport request, concurrency 1, 2,000,000 bytes per response,
8,000,000 transport total-byte budget, 16,384 header bytes, a 15-second network
timeout and a 20-second navigation timeout. The batch has a 120-second abort
deadline; synchronous bounded parsing is not preemptible by a timer. Extraction
is capped at 256,000 bytes, 50,000 nodes, and depth 128. Eight URLs therefore have
at most 96 transport requests and eight independently bounded byte budgets.

Each stdout JSON line records requested/final URL, UTC start/finish timestamps,
profile, primary response evidence, navigation/extraction or a static failure
category/stage, reader omissions where available, and native network metrics.
Metadata URLs redact queries and remove fragments. Extracted public page content
and its links are not a general-purpose secret-redaction facility: only submit
public, noncredential URLs.

The first primary transport response is summarized **before loading/parsing**;
later stylesheet responses cannot overwrite it. Evidence includes status,
bounded Content-Type/Content-Length/Content-Encoding values, encoded/decoded byte
counts, redirect count, timing, and SHA-256 of the exact transport-delivered body
bytes before text decoding or sanitization. The transport has already decoded
HTTP content compression; this is not a compressed wire-byte hash. Raw bodies,
Set-Cookie, authorization and arbitrary headers are not emitted. If transport
fails before providing a complete response, response evidence stays null; no
partial hash or missing final URL is invented.

`classifyBrowserChallenge` from `src/browser-challenges.ts` runs on primary
status/headers before the loader, and on bounded extracted title/text afterward.
A header-confirmed challenge stops immediately while retaining its response
hash, even when the body would fail parsing. Challenge, login and access-denied
diagnostics remain `semantic-barrier`, with static evidence and the classifier's
`stop-and-request-user-handoff` action; Retry-After is reported, not acted upon.
Text-only classification needs successful extraction. A null classifier result
is inconclusive, never confirmation of content success.

Outcomes are `extracted-unverified`, `semantic-barrier`, `http-failure`,
`empty-extraction`, or `failure`. `contentSuccess` is null for unverified
extractions and false otherwise, never true. Exit 0 means every requested URL
produced nonempty, 2xx, unverified extraction; exit 2 means a mixture of those
extractions and failures/barriers; exit 1 means no extraction successes; exit 64
means invalid CLI input/setup. Exit 0 is not a website compatibility gate.

## Validation and integration handoff

On September 5, 2026 the explicitly selected new synthetic file
`src/research-loader.test.ts` passed **36 tests**, including inert native parsing,
omissions, malformed/CDATA containment, budget failures, unchanged normal SVG
rejection, metadata preservation on parse/extraction failure, public-input policy,
primary-versus-stylesheet evidence, and classifier integration. Tests replace the
native transport's request method with synthetic responses; no DNS, socket, real
TTY/PTY, live site, or actual SafeJS probe is involved.

Project strict `--noEmit`, the separate strict new-test type check, and Biome on
the three owned TypeScript files also passed. Integrated compiler logs are
`/tmp/research-reader-noemit-integrated.log` and
`/tmp/research-reader-testtypes-integrated.log`. The full native test list was
not run, and no shared build output was regenerated.

Run this file without editing the parent's native manifest:

```sh
node --input-type=module -e 'import { startVitest } from "vitest/node"; const runner = await startVitest("test", ["src/research-loader.test.ts"], { config: false, include: ["src/research-loader.test.ts"], maxWorkers: 1, watch: false }); await runner.close();'
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --forceConsistentCasingInFileNames --resolveJsonModule --isolatedModules --verbatimModuleSyntax --types bun --lib ES2022,DOM,DOM.Iterable src/research-loader.test.ts
node node_modules/@biomejs/biome/bin/biome check src/research-loader.ts src/research-loader.test.ts scripts/research-browser.ts
```

Initial local validation found a literal-limit TypeScript inference error and
one test expecting unescaped Markdown ampersands; the limit type and assertion
were corrected without changing native extraction. Initial logs remain in
`/tmp/research-reader-noemit.log` and `/tmp/research-reader-tests-initial.log`;
the synthetic test result is in `/tmp/research-reader-tests-final.log`. These
temporary logs are development evidence, not historical live research reports.

Owned patch paths are only `src/research-loader.ts`,
`src/research-loader.test.ts`, `scripts/research-browser.ts`, and this document.
The parent owns manifest/index/command integration, `TASKS.md`, review and commits.
No shared native parser/CSS/transport implementation or round-one report is
changed here. Remaining acceptance gates: parent integration build, explicit
native-list registration, and separately authorized new live native research
with the profile disclosed. No live vendor/research reading success is claimed
by these synthetic checks.

## Cookie-context integration correction

Parent review on September 5, 2026 found a concrete integration failure missed
by the original 36-test run: `BrowserSession` supplies cookie request context,
but the runner had not passed the session jar to `NodeNetworkTransport`. Native
transport rejects that combination before issuing a request. The original
36-test result and `/tmp/research-reader-tests-final.log` remain unchanged;
their mocked request boundary was insufficient evidence of transport readiness.

The runner now accepts the jar in `createTransport(cookieJar)` and passes it to
the native transport. Immediately before every `native.request`, it copies the
request and its context, overriding only credentials with `"omit"` (defaulting
the site URL to null only when no context supplies it). Existing site URL,
top-level-navigation and other context fields survive. Explicit credential
headers remain rejected. Native cookie policy therefore validates successfully
without consulting the jar for outgoing cookies or storing response cookies.

The new synthetic run passes **39 tests**, preserving the original 36 and adding
three regressions. Two exercise both reader and normal profiles through the
real native `requestWithRoutes` implementation, including request-context
validation, a redirect, and the normal profile's stylesheet request. Only the
response delivery is synthetic: the route resolver always supplies a fixture or
throws, never falling through to DNS/sockets. Tests assert omitted credentials,
preserved context, real transport request metrics, and zero calls to cookie
retrieval/storage even when fixtures include Set-Cookie. A third negative control
proves that an actual transport without a jar still rejects omitted-credential
context before resolving its synthetic response.

New evidence, separate from all earlier results:

- `/tmp/research-reader-cookie-regression-before.log`: both profile regressions
  fail at the original native request-validation boundary.
- `/tmp/research-reader-cookie-regression-after.log`: intermediate failures while
  adapting fixtures to the native routed-response contract; these are retained.
- `/tmp/research-reader-cookie-regression-final.log`: all 39 tests pass after
  supplying zero encoded wire bytes for synthetic routes and correcting the
  expected initial site URL to null.
- `/tmp/research-reader-cookie-regression-repeat.log`: all 39 tests pass again
  after an explicit fixture return type resolves strict union inference.
- `/tmp/research-reader-cookie-noemit.log` and
  `/tmp/research-reader-cookie-testtypes-final.log`: project noEmit and strict
  new-test typing pass. The initial fixture type error is preserved in
  `/tmp/research-reader-cookie-testtypes.log`. Biome also passes on both changed
  TypeScript files.

This correction changes only `scripts/research-browser.ts`,
`src/research-loader.test.ts`, and this document. It does not change native
transport/session code, rebuild shared `dist`, or perform a live/socket/auth
probe. The corrected source is prepared for the parent's integration build and
authorized round-two live research; the synthetic result is not live success.

## Bounded login-redirect followup — September 5, 2026

The runner now supplies the actual primary-response URL privately to the
post-extraction classifier. A possible-login result requires an exact `/login`
or `/login/` path and adjacent Google/Apple continuation text. The URL must be a
bounded absolute HTTP(S) value without credentials, controls or backslashes.
Diagnostics contain fixed labels, never the supplied URL or query. Existing
confirmed challenge precedence remains unchanged. This narrow English-language
heuristic is not a general login detector; null remains inconclusive, and
extracted content remains available for review.

Forty-six new synthetic cases bring seven named files to **333 passing tests in
each of the working and isolated trees**. Types/builds, strict changed-test types
and scoped Biome checks pass; the native manifest remains 422 entries, not an
executed full-suite result. Saved-response replay recognizes the two earlier Poe
login pages without marking six readable X-post fixtures as login barriers.
Evidence is retained under `node_modules/.cache/native-validation/` in
`login-diagnostics-final-*`, `login-diagnostics-report.md` and
`login-diagnostics-saved-replay.json`.

A separate authorized native-reader request to `https://poe.com/about` at
**2026-09-05 03:16:54 UTC** followed two redirects to a status-200 login page and
reported `semantic-barrier` / possible login. No login, credentials, scripts or
challenge solver ran. The earlier sandbox attempt remains a network failure.
Both new records are preserved as `browser-research/login-followup-sandbox.jsonl`
and `browser-research/login-followup-live.jsonl` beneath that evidence directory.
The decoded response-body SHA-256 is
`8ad4f6cdb9cdb9f05c218c35c042cc886efd228a155115b6d6abf84cd78f6520`;
the built runner SHA-256 for this followup is
`4d27758700bb337ca3dbfec4bdd76674673757cbd5804247cd1f2ef6a9991280`.
Historical round-two outcomes, measurements and runner hashes remain unchanged.
