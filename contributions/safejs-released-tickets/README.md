# Skip escape rescans for released compile tickets

This local SafeJS contribution avoids a second retained-graph traversal when all
regex compile tickets discovered by the first traversal have already been
released. It does not skip the first data measurement or change runtime limits.

`released-tickets.patch` applies to the previously qualified source snapshot
`/tmp/agent-browser-sdk-absent-captures-P8S12x/candidate`. SHA-256:
`ac54b580858459b840b6566989d6bd6ac96630ab91a1eb79d7c9f39cf9a66425`.

The activity check uses generation and actual membership in the ticket owner's
budget, not a positive-charge test. Zero-charge active tickets, shared realm
views, foreign owners, deferred disposal and provisional completion continue to
receive the existing escape scan. Discarded tickets cannot be resized or revived
through the existing budget API. Mutable descendants are still measured on every
reconciliation, and data limits remain enforced.

## Validation

- Baseline reproduces three duplicate-scan failures: discarded, transferred and
  prior-generation tickets invoke a capture provider twice instead of once.
- Final13 focused cases and250 selected tests across23files pass; strict types
  and the core/node build pass. Independent source review found no actionable
  correctness issue; its four additional edge cases are included in the final13.
- All eight source lanes have4,591 parent-verified input hashes and closed
  processes. Source evidence: `/tmp/agent-browser-sdk-released-tickets-w68sa7j8`.
- All nine native Event/legacy/Unicode checks pass in11.686seconds on unchanged
  core50. Evidence: `/tmp/agent-browser-released-ticket-actual-fzl9mopn`.
- `git apply --check` passes against the stated baseline. The separately assembled
  package changes only `dist/interp/budget.js`, `budget.d.ts` and `values.js`.

Package: `/tmp/agent-browser-released-ticket-sdk-cybnsyeb/package`,2,863files.
Package manifest SHA-256:
`05e5e2a44d077b71e57ca1e4a0a989c1898a3914e5d27f7080f1dc5262eb2564`.
The later edge-case additions are test-only; they do not change this package.

## Zoom remains blocked in initialization

The exact captured417,914-byte vendor still times out at120.300seconds,
827,879steps and801,524peak data units. The earlier2x8YPp package reaches825,291
steps at120.278seconds. This is no established useful end-to-end improvement.
Evidence: `/tmp/agent-browser-released-ticket-vendor-orj6r_tw`.

Both actual integration gates have7,085 parent-verified inputs, unchanged limits
and complete observed cleanup. This is not default activation, a published SDK,
a fresh live Zoom load, successful initialization, admission or audio capture.
See `reports/zoom-runtime-followup-2026-09-19.md` for the surrounding diagnosis.
