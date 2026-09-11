# Native stylesheet policy integration — September 11, 2026

The native HTML loader admits bounded `integrity`/`crossorigin` stylesheet loads
through an explicit policy-aware capability instead of rejecting both attributes.
This is not a full HTML/Fetch/CSP conformance claim or website acceptance result.

## Contract and boundaries

- `DocumentLoaderContext.fetchStylesheetWithPolicy(url, policy)` is a separate
  optional capability. Legacy URL-only callbacks cannot silently discard policy;
  policy-bearing links still fail closed when the capability is absent.
- Missing `crossorigin` requests no-CORS/include. Empty, anonymous or invalid
  values request CORS/same-origin; the use-credentials keyword requests
  CORS/include. Anonymous does not omit same-origin credentials.
- BrowserSession uses bounded manual redirects, per-hop CORS/credential taint,
  mixed-content rejection, existing queue/cancellation ownership, the transport's
  advertised redirect ceiling, and a shared stylesheet request allowance.
  Custom callbacks are trusted to implement their advertised response policy;
  opaque results cannot satisfy CORS requests or effective SRI requirements.
- SHA-256/384/512 validation selects the strongest supported metadata and matches
  response-body bytes before BOM/charset text decoding. Mismatches are not applied.
  Empty/unsupported-only metadata is not advertised as a digest match. Parser
  recovery, representation choices and bounds are in `SUBRESOURCE-INTEGRITY.md`.
- Status, explicit CSS MIME, body/text, sheet-count and abort boundaries remain.
  Header or meta CSP blocks the newly admitted policy path because CSP enforcement
  is not implemented. Ordinary legacy loading has not gained full CSP support.
- The final response URL is validated and retained in network evidence.
  `setExternalSheet` receives the original requested link URL because it uses
  this argument as mutation identity, not a new CSS-relative-resource base.
  Redirects must not falsely trigger `changed-stylesheet-needs-reload`.
- Completed network-journal entries mean successful fetching, not successful
  integrity checking, stylesheet application, layout or genuine pointer action.

No dependencies, page-script execution, real secret access or alternate browser
are added. Passkeys, credentials, devices and actual website acceptance remain
separate gates.

## Sources and focused evidence

`STYLESHEET-INTEGRITY-SOURCE.md` preserves the canonical redirect failure and
native SRI extraction. `STYLESHEET-CORS-SOURCE.md` preserves the HTML settings
mapping and Fetch's 50,001st-node limit failure, not a successful Fetch extraction.
Parent verification passes for all 79 SRI and 75 CORS receipt entries. Missing
full Fetch integration/decode-stage primary evidence remains explicit.

The primitive worker passes 97 native cases. The fetch worker passes 99 focused
cases and 36 existing manifest-listed regressions; its 102 receipt hashes verify.
Independent source review finds no concrete supported-scope regression and pins
all nine final source/test files, without claiming runtime acceptance.

Parent loader/session evidence is in
`node_modules/.cache/native-validation/native-stylesheet-loader-work-september11/`:

| Attempt | September 11 UTC | Result |
| --- | --- | --- |
| Original loader + regressions | 16:58:45.033–16:58:46.753 | 15 pass / 17 fail |
| First integration | 17:00:51.039–17:00:53.184 | 130 pass / 3 fail |
| Corrected integration + edge cases | 17:02:53.649–17:02:56.067 | 141 pass / 0 fail |

Intermediate failures expose the new integration's wrong link identity after
redirect and an incorrect test assumption that every adapter advertises queue
metrics. Both are corrected without changing unrelated styles code. Queued policy
request cancellation is tested after both successful and failed loading. All
targeted source inventories remain stable; original failures are retained.

## Broad native gate

`native-stylesheet-integration-september11-round03`, beneath the same private
validation directory, passes **9,060 cases, zero failures, two explicit existing
exclusions**, across **151 selected manifest-listed suites / 150 strict roots**.
Build, strict and formatting pass. UTC **17:07:28.194–17:09:38.531**.

The audited source is clean `372e8a3` plus nine scoped source/test files and only
two owned manifest additions: **1,024 source/input files / 1,832 compiled files**.
All worktree candidate bytes match the validated snapshot; other archived inputs
match that Git base. Input inventories remain stable. The separate pre-existing
passkey manifest additions and other dirty work are excluded.

- Source inventory SHA-256: `d599b08a005f1c50cbada100783bf5184bd2ffa52ad9ea69133d622ad033b809`.
- Compiled inventory SHA-256: `91490461255c1a5f0b1ba32880e44b83d20941aed14826972bc077a7505552de`.
- Exclusions: the existing total-host-object-ceiling case and the independently
  reproduced stale Grid/media-fallback expectation documented in
  `IMAGE-FALLBACK-INTEGRATION.md`. Neither is counted as passing.
- Strict checking retains its existing `src/snapshot.test.ts` omission.

Round01 fails preparation because of a duplicate test selection; no tests run.
Round02 loses the native output to ENOSPC and has no recorded native result;
its completed build/strict/format outputs remain. These failures are not rewritten
as the round03 pass. Only four retired copies made during this change were moved,
byte-checked, to temporary backing with original-path symlinks to free space;
no unowned files or historical receipts were deleted. Temporary backing is not
durable storage. The full disk remains an operational limitation.

Round03 uses hardlinked frozen source inputs and a separately compiled dist;
JavaScript network guards, socket-denying tool-child seccomp, single-thread
native tests and existing resource/time caps remain. This gate is not a live
website, credential, device, socket or SafeJS validation.
