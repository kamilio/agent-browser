# Camoufox architecture research — September 5, 2026

## Scope and outcome

This is a native-only architecture research checkpoint, **not a product
recommendation, implementation audit, anti-detection measurement or challenge
acceptance**. The useful transfer is consistent, truthful observable behavior
and deliberate host/page boundaries—not adopting Camoufox's engine or inventing
a physical-device identity.

All three source reads used the already validated, fixed
`node_modules/.cache/native-validation/reader-marker-integrated.qF5Iaq/dist`
native browser. **The then-pending selector enhancement was not used.** No Camoufox,
Firefox, Chromium, Playwright, Xvfb, remote browser, solver or new dependency was
installed, imported or executed. No account, private credential or protected
target was accessed; all denied gates remain untouched.

## Exact source receipts and provenance

All receipt times below are **UTC on September 5, 2026**, not release or
publication dates. Each request had separate exact network approval and exited
zero. The first URL is the user's repository link; subsequent URLs were actual
links in its successful native extraction, not guessed raw/API endpoints.

| Source | Actual URL | Receipt | HTTP / decoded bytes | Scopes / serialized extraction bytes |
| --- | --- | --- | --- | --- |
| S1 README | https://github.com/daijro/camoufox | 06:30:40.780 | 200 / 539,966 | 196 / 158,253 |
| S2 fingerprint docs | https://camoufox.com/fingerprint/ | 06:31:06.496 | 200 / 49,758 | 10 / 6,785 |
| S3 virtual-display docs | https://camoufox.com/python/virtual-display/ | 06:31:34.207 | 200 / 36,743 | 11 / 7,538 |

S1 native link references **e2372** and **e2926** supplied S2 and S3 respectively.
Original transport-decoded body SHA-256 values:

- S1: `eeb1513cf6bfd285f0c910f0dc5c358a47861b0b2a7ac65cdb26bf4035de7b89`
- S2: `272c7a8f063559696136ab349f003f4f3451c982d0b4336a5fa0e3d58591cf1c`
- S3: `5c27c3a425ebb986830d0f47507e2f8de3ca1a872b1b11c4fa0fb738b4108412`

All three original decoded bodies were saved before native loading and checked
against their receipts. These are not compressed-wire, TLS or extracted-text
hashes. Evidence root, abbreviated **C** below:
`node_modules/.cache/native-validation/camoufox-native-review/`.

`C/response-N.body`, `C/receipt-N.json`, `C/read-N.jsonl`, `C/read-N.time`,
`C/read-N.stderr` and `C/attempt-N.json` preserve each attempt; `C/source-N.md`
contains derivative native scopes. `C/REPORT.md`, `C/COMMANDS.md`, `C/PROMPT.md`
and `C/AUDIT.json` retain the original research decisions and limitations.
References below are load-local native roots in those source artifacts.

## Architecture the sources describe

**Firefox/C++/Playwright lineage.** S1 **e2192/e2202/e2383** describes a Firefox
fork with Python-facing Playwright compatibility. S1 **e2324/e2364** and S2
**e137/e153** attribute identity interception to C++ implementation changes and
automatic BrowserForge generation for unspecified configuration. This is the
authors' architecture description, not independently verified patch behavior.
No upstream code checkout, binary, generator or installed package was evaluated.

S1 **e2772/e2775** and its Juggler discussion near **e2917/e2926** describe
isolating automation machinery from ordinary page JavaScript through patched
Firefox/Juggler behavior. A privileged host/page separation is a useful
correctness and confidentiality principle; it is not proof of invisibility or
permission to impersonate trusted user activity. That engine-specific machinery
is not an implementation path for this independent TypeScript browser.

**Engine behavior is not an identity string.** S2 **e170** warns that Chromium
fingerprints do not fit its Firefox engine because JavaScript behavior differs.
This is an authored compatibility warning, not a measured theorem. The native
lesson is to retain AgentBrowser branding and actual capabilities rather than
copy Firefox/Chromium labels onto unsupported behavior.

**Xvfb is a real additional display environment.** S3 **e140/e178** describes
Linux Xvfb and a mode spawning a background virtual display for Camoufox. S1's
linked explanation concerns running its Firefox-derived browser in that
environment—not assigning viewport numbers to a headless data model. The
installation examples were captured but never executed. This differs from the
native no-output-device/no-client-window contract; a configured logical CSS
viewport is neither an X server nor a measured physical screen.

## Consistency lessons and evidence limits

S1 **e2239/e2268** and the feature list near **e2528/e2555** claim coordination
across navigator/UA/language headers; Screen/window/viewport dimensions; locale,
timezone and geolocation; WebGL/fonts; audio/voices/device counts; and WebRTC
network presentation. This is a surface-category inventory, not verified
support for every property, default, platform or release.

For independent-native work, related values should share an explicit, bounded
host model and lifecycle, with documented overrides and truthful provenance.
Randomizing isolated properties can create contradictions. Do not fabricate
GPU, font, audio, camera, location or hardware claims to make metadata appear
plausible. Unsupported APIs need real implementation or explicit limitations,
not borrowed labels. Privacy-exposed geometry must not be sold as monitor data.

**Property-schema gap:** S2's selected scopes did not expose a detailed property
inventory; the introductory list area included empty scopes. Dynamic content
versus reader/selection omission was not isolated. This neither proves missing
product support nor supplies unknown field names/defaults. There was no
script-enabled retry, guessed alternate route or inferred complete schema.

**Marketing and qualifications must stay together.** S1 advertises anti-detection,
low overhead and keeping up with Firefox. Its **e2764** warning, labeled only
**2026**, describes a year-long maintenance gap, an older Firefox base and newly
found fingerprint inconsistencies; **e2781** says rotation requires maintenance.
S3 **e137** likewise cautions about possible headless detectability. These are
author statements, not independent current-release or effectiveness findings.

The year-only warning is not an exact publication date. No release/tag check,
performance benchmark, detector, statistical-fidelity evaluation or Cloudflare
demo was run. No latest-effectiveness, production challenge-success or
modern-tool-superiority conclusion follows from this retrieval.

## Native seams and future evidence

Read-only inspection occurred with local HEAD **21da8de**, the committed native
headless-display feature. Existing uncommitted work in `src/page-bindings.ts`
and `src/command-host.ts` was preserved. These observations do not certify that
work or actual guest/runtime behavior; inspection hashes identify its state.

| Inspected native seam | Transferable requirement | Evidence still needed |
| --- | --- | --- |
| `src/browser-identity.ts:1`, `src/browser-identity.ts:106`, `src/node-identity-config.ts:20` | Truthful AgentBrowser identity, bounded explicit languages and header defaults; preserve deliberate caller overrides | Targeted consistency/admission cases and separately authorized actual boundary verification |
| `src/document-identity.ts:11`, `src/session.ts:1628` | Document-owned identity, no replacement and close cleanup | Lifecycle/navigation evidence and actual guest identity semantics, not source inspection alone |
| `src/session.ts:1282` | Central request-header application across ordinary routes/transport | Explicit override, navigation and request-path coverage; no proxy/TLS impersonation proposal |
| `src/native-headless-display.ts:1`, `src/page-bindings.ts:318`, `src/page-bindings.ts:554`, `src/session.ts:430` | Shared DPR=1, outer dimensions=0 and logical viewport scale; no physical-screen/Xvfb fiction | Parent's independent validation and separately authorized runtime gates; this research adds no acceptance |
| `src/page-bindings.ts:348` | Inner viewport dimensions remain distinct from absent client-window outer dimensions | Geometry/lifecycle contracts for future Screen and visual-viewport work |
| `src/page-runtime.ts:50` | Deliberate host/page capabilities without engine substitution | Runtime security review; no new dependency beyond the approved SafeJS page runtime |
| `src/command-host.ts:1040`, `src/command-host.ts:1118` | Preserve confidential command gating and trace/artifact/state sealing | Dedicated synthetic confidentiality regressions; identity diagnostics must not become secret/profile export paths |
| `src/browser-challenges.ts:148` | Retain stop-and-request-user-handoff diagnostics | Separate explicitly authorized acceptance, never solver advice or denied-route retries |

These are future review seams, not new edits, test results or permission to
reopen denied RP/identity/SDK/listener/device gates. The native headless commit
and pending selector work are independent of the older fixed research binary.

## Bounds, cleanup and checksum verification

The full budget was **three actual requests**, sequential, with zero redirects,
retries, mocks or barriers. Every transport closed with zero active requests;
no live tool handle remains. Aggregate payload: **626,467 decoded bytes** and
**104,582 encoded bytes**. No approval, network, loader or extraction failure
occurred; no previous failure was overwritten or reclassified.

Transport/source ceilings stayed <=2,000,000 bytes/code units; DOM limits stayed
50,000 nodes, depth 128 and 2,000,000 text code units, with stricter reader limits
unchanged. **217 scopes / 172,576 serialized bytes** shared a <=256,000-byte
phase allowance; every scope was <=32,000 bytes, largest **6,718**. No budget
stop or DOM rewrite occurred. Scopes include metadata and nontechnical README
material; they are not 217 independent sources. Scripts/styles/SVG may be omitted,
hidden-content semantics are unsupported and source IDs stripped. Native scoped
reading is not full rendering, schema coverage or product-behavior acceptance.

At **2026-09-05T06:38:06.784Z–06:38:06.821Z**, existing ledgers were independently
checked read-only with `sha256sum -c` from `/home/kjopek/project/agent-browser`:

| Ledger under C | Successful entries | Exit |
| --- | ---: | ---: |
| `SHA256SUMS` | 31 evidence artifacts | 0 |
| `INPUT-SHA256SUMS` | 1,584 fixed-build inventory entries | 0 |
| `LOCAL-INSPECTION-SHA256SUMS` | 9 inspected worktree source files | 0 |

No mismatch/missing-file exception occurred. Rechecking the build inventory is
not another set of unique artifacts, tests or live measurements; source hashes
do not prove code correctness or a clean worktree. Ledgers cover their enumerated
files only, not later handoff prompts or this new document. Original ledgers,
reports and logs were not rewritten. The worker's documentation handoff made no
requests, other file changes, tests, imports, builds, probes, staging or commits.
