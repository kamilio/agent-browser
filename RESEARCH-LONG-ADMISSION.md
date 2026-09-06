# Explicit bounded long-HTML admission: host foundation

Trusted host callers can explicitly select `long-v1` for body capture/decoding
and the inert native HTML reader. Omitted or explicit `default` retains existing
behavior. The research CLI does **not** accept a document-profile flag in this
first slice; its network, reader and capture defaults remain unchanged.

## Implemented interfaces

- `validateResearchDocumentProfile(value?)` accepts only primitive `default` and
  `long-v1`, with omitted/undefined meaning default. Other values fail without
  coercion or inspecting an object; errors do not contain the input.
- `captureResearchBody(body, profile?)` and
  `decodeResearchBodyCapture(capture, profile?)` validate the host parameter
  before input inspection. The exact four-field capture schema is unchanged.
  Records cannot select their own profile, and a long capture remains rejected
  by a default decoder when it exceeds the default cap.
- `sanitizeResearchHtml(source, options?, signal?, profile?)` selects immutable
  per-call ceilings and still rejects invalid/over-ceiling overrides.
- `loadResearchDocument(response, context, profile?)` selects the same reader
  ceilings. Long mode requires the existing MIME-rule `text/html` before text
  decoding; it does not widen plain-text/Bikeshed or text-line admission.

`src/research-admission.ts` defines the named, deeply frozen contract. It is not
added to the general browser command API. Page markup, response headers, URL
parameters, capture fields or prior calls do not opt subsequent operations in.
The existing reader profile remains `native-semantic-reader-v1`: semantic-reader
identity and resource-admission selection are different concepts.

## Independent limits

| Active boundary | Default | Explicit `long-v1` |
| --- | --- | --- |
| Capture/decode bytes | 2,000,000 | 4,000,000 |
| Reader source code units | 2,000,000 | 4,000,000 |
| Reader emitted text code units | 1,000,000 | 2,000,000 |
| Reader output code units | 2,000,000 | 4,000,000 |
| Reader tokens | 100,000 | 200,000 |
| Reader depth | 128 | 128 |
| Long tree ceilings | Existing caller/default behavior | 50,000 nodes, depth 128, 4,000,000 text code units, 1,024 retained changes |

Long loads snapshot the four caller document limits once, validate positive safe
integers without repairing Infinity or coercing strings, and clamp each to the
named tree ceiling. Tighter caller values remain tighter. Reader guards and the
actual parser receive the same selected values; caller context is not mutated.
The default branch retains its previous caller-context behavior.

The reader encoded-input precheck remains `selected source units * 4 + 3`, at
most 16,000,003 bytes for long mode. It is an independent decoding-work guard,
not an increased capture or network byte allowance. Actual parser input work is
at most 32,000,000 code units and parser tokens at most 400,000, derived from the
selected tree limits. Unchanged heading extraction remains independently bounded
by its existing output, node, depth, entry, title and selector limits.

The existing inert sanitizer still omits scripts/styles/active subtrees, makes
forms inert and reports partial semantic output. Finite source admission does
not mean complete rendering, page JavaScript, successful extraction of every
document, or a four-megabyte heap bound. Escaping and copies can amplify memory;
no process-memory or performance measurement is claimed.

## Not activated in this slice

The named record also pins proposed network, deadline/navigation, heading and
evidence contract values for later integration. **Exported constants are not
new transport/scheduler/serializer enforcement.** This change does not wire a
4,000,000-byte CLI network budget, six-megabyte receipt limit, profile-bearing
receipt, replay validator or atomic evidence publisher. Default CLI serialization
and the frozen historical engine are unchanged. Heading limits are exercised
through the existing native API, not a newly activated CLI mode.

CLI argument validation, per-operation wiring, complete effective-budget
provenance, bounded output/replay and separately reviewed live admission remain
the next integration gates. A profile name or successful local test is not
authorization for a network request, automatic retry or changed historical
verifier. All earlier stopped/denied gates remain in force.

## Validation boundary

The isolated dependency closure is pinned to
`8ecdde6aeb0e1163f20c92f0b88574c99d6d9c28`; unrelated working changes are excluded.
Evidence is under
`node_modules/.cache/native-validation/research-long-admission/`.
Native scope is exactly four new profile/capture/loader/chain files and four
existing capture/loader/limit/heading regression files, not the full manifest.
Inputs are finite synthetic data; no live HTTP/DNS/socket, SafeJS runtime, TTY,
real vault/password, passkey device or account operation is part of this scope.

Setup01 retains a test-only readonly-header type error and five Number-namespace
lint findings; production build passed and no native run used that snapshot.
Setup02 build/strict/Biome passed; native02 recorded 588 passes and two chain-test
failures because the assertion expected an unescaped period in Markdown. The
existing extractor escapes that punctuation. The corrected assertion checks
both plain DOM text and escaped Markdown; runtime code is unchanged. This
failed result and both original fixtures remain preserved, not relabeled.

On September 6, 2026, native03 passes **590 tests across eight files**, with zero
failures or pending cases, exit 0, at
`19:45:32.769872673–19:45:51.657388348 UTC`. Counts are profile 27, capture 36,
loader 63, chain 5, existing body capture 138, loader limits 63, loader 99 and
headings 159: **131 new cases**. Build, strict types and Biome pass for the final
snapshot. Three formatter passes were used in total. The earlier native02
interval remains `19:42:48.728971419–19:43:05.806675559 UTC`, exit 1.

The three production source files are byte-identical across all three setup
snapshots. New tests establish default-versus-opt-in boundaries through actual
in-memory operations; no absent-API negative control is presented as a defect.
Each native invocation received its own exact-scope authorization. Runtime
identities are admission contract
`3725d4e3d906818156f71471b3912f0a3e7b4d5cfacac1f65aa97d000bd602f9`,
reader `5aacb79e44f5c3058d037362acabe57a0fae12dbb2bb1881507ba1517750d76a`,
and capture `af7858dfbc4cb962a5e5057586390a54d3192b39ce0aa5ceb57fc3cc5ee5a27b`.

The published Level3 network-size failure and later no-match draft query remain
unchanged. These synthetic fixtures neither recover that source nor resolve its
privacy wording or the archived Level1 ambiguity. Attestation privacy, actual
HTTP/device/page acceptance and the overall browser goal remain open in TASKS.md.
