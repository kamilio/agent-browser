# Private finite native network-policy diagnostics

The native network layer now attaches a closed, fixed reason to errors created at
twelve existing policy guards. This improves future diagnostic precision without
changing what the browser permits. It does not explain a historical refusal,
authorize a retry or bypass a challenge.

## Identity and scope

Internal `src/network-policy-diagnostic.ts` provides `networkPolicyError` and
`networkPolicyDiagnostic`. The factory accepts only a primitive known own-key
reason, constructs the same `AgentBrowserError` category/message as before, and
privately associates that exact object with a frozen record:

```json
{ "kind": "network-policy-v1", "reason": "https-downgrade" }
```

The getter uses only object/null checks and WeakMap identity, never properties,
prototypes, messages, stacks, causes or coercion of its input. Repeated reads are
nonconsuming. Copies, lookalikes, wrappers, unissued errors and Proxies around a
real error do not inherit the record. Invalid factory inputs produce one fixed,
unmarked invalid-input error. The diagnostic contains no URL, address, port,
header/cookie/credential value, body, request identifier, HTTP status or server motive.

The exact reason set is:

- URL admission: `url-scheme`, `url-credentials`, `blocked-port`, `origin-not-allowed`.
- Address admission: `local-name`, `literal-address-policy`, `resolved-address-policy`.
- Request admission: `transport-controlled-header`, `method-not-allowed`, `cookie-header-controlled`.
- Redirect admission: `redirect-mode-error`, `https-downgrade`.

Only the twelve error constructors and imports change in `network.ts` and
`node-transport.ts`. Guard predicates/order, fixed messages, category, origins,
addresses, methods, headers/cookies, redirect behavior, deadlines/cancellation,
accounting and existing rethrow/wrapping remain unchanged. The resolved-address
reason stays combined; malformed resolver-result shapes remain network-error.
Replacement errors do not copy earlier metadata. A new helper stack frame is not
claimed to preserve stack identity.

This is trusted issuance provenance, not current-request ownership or protection
from malicious host code. Public mutation of an issued error does not alter its
recorded creation reason. Existing outer instanceof paths are not made Proxy-safe
by this getter. Absence is unknown, not permission or retry clearance.

No barrel, page, journal, public error property or research report/validator schema
changes. A future reporting integration must separately admit exact reason schema
and category co-presence. Historical NVIDIA policy-denied remains unexplained;
old frozen engines and evidence are not rewritten or used for a new request.

## Actual isolated validation — September 8, 2026

Committed85dc1e42 source/config and package form the isolated baseline. Four exact
candidate files and one explicit test-list addition produce manifest521 from520;
the two pending root manifest entries stay excluded. Existing `network.test.ts`
bytes remain unchanged. The mixed root's corresponding manifest has523entries.

- Format01,09:07:39.321202816–09:07:39.672776904Z: four formatter exits0, but
  helper parse/aggregate/outer1. Its template delimiter is malformed; no candidate
  patch executes. Original helper, failed evidence and authority remain intact.
- Separate format02,09:10:07.719052647–09:10:08.093782413Z: corrected helper,
  four exact formatter outputs and aggregate/outer0. Neither format wrapper bounds
  its authority precheck under the60second runner deadline; that limitation remains.
- Setup01,09:14:16.199740255–09:14:25.645934027Z: build0/types0/lint1 solely for
  the new test's import-block order. Only that order changes afterward.
- Separate setup02,09:16:24.323219426–09:16:33.839969494Z: build0/types0/lint0.
- First native execution, named02,09:17:29.010331885–09:17:32.987643301Z:
  **128pass,0fail,0pending across two files**:48new cases and80unchanged prior cases.

Setup/native intervals above are supervisor records. Their separately added
supervisor bounds the entire outer wrapper, including prechecks/final records,
under120+5seconds for setup and210+5 for native; native has its own180+5child bound.
Supervisor startup/final publication is outside that deadline, not atomic/durable
storage proof. Every actual action has fresh approval; only format01 approval had
a timeout followed by one identical approved retry. No native01 was executed.

New tests exercise all twelve actual guards separately from factory/getter cases,
exact frozen records, spoof/hostile/revoked values, allowed controls, genuine
session/journal propagation and replacement noninheritance. DNS/HTTP/HTTPS/server
sentinels must remain unused. Synthetic native routes exercise redirects without
following or forwarding. Session race fixtures deliberately hold a call-through
refusal; they are not unmodified wire timing tests. No real network, document/page
runtime, vault, device, TTY or SafeJS operation occurs. No full-suite claim follows.

Native JSON:40055bytes, SHA256
`8ea74d7f52b16704f5fb0f9d6849b7433ea33ecabb2f2ff9abcd286f568efa92`.
The2731-entry expected/before/after input ledgers match exactly, including the
regular-file set: `c919c67f44767eb29c7b6e1104e2e9cef72e0f15cbf2536274317fe774bf35c6`.
Parent independently rehashes all2731 inputs; audit SHA256
`37aeb7cdfae5f63112a08095e9a9aec78240c319ab81129f2366c30a486bf198`.
Independent integration review finds no actionable discrepancy, confirms the exact
tested root files and retained pending work, and rehashes selected actual inputs.
The328-file feature ledger is sealed and all328opaque hashes pass the final audit:
`64a992ee25bda7d2311a81042e4c13b72656d1c620be04ee11da403a9827fe43`.
No native/validator execution is repeated by this seal.
Evidence: `node_modules/.cache/native-validation/native-network-policy-diagnostic/`.
The ongoing browser goal and all outstanding acceptance gates remain in `TASKS.md`.
