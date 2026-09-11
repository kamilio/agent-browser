# Native image fallback integration — September 11, 2026

`IMAGE-FALLBACK.md` retains the worker's exact policy, 194-case native results and
sealed source/report identities. The bounded implementation renders present,
nonempty alternatives for eligible final-broken images as real native text. It
does not decode SVG, manufacture image pixels or implement empty-alt/loading/
quirks/responsive-image cases. Native fetch/decode failure state remains visible.

## Parent validation

- Read-only review finds no concrete correctness, resource or lifecycle regression
  in the three-file candidate. Owner/lifecycle exceptions still propagate;
  successful alternative rendering does not mean successful image fetching/decoding.
- First expanded gate: **8,831 passed / 1 failed / 1 existing exclusion**, stable
  inputs; build, strict and format pass. The newly selected media-fallback suite
  has a stale expectation that coordinated Grid remains unsupported.
- A separate clean `d377659` baseline, without any image-fallback changes,
  reproduces that exact failure: **29 passed / 1 failed**, UTC
  **16:24:37.232–16:24:38.774**. No unrelated test or production code is changed.
- Final gate: **8,831 passed / 0 failed / 2 explicit exclusions**, 149 selected
  native files and 148 strict roots. Build, strict and format also pass; UTC
  **16:25:36.305–16:27:45.282**. Clean `d377659` plus exactly three scoped files;
  **1,020 source/input files, 1,824 compiled files**. All source hashes stay stable,
  and the parent verifies each scoped worktree file byte-for-byte against the build.

The two exclusions are the existing total-host-object-ceiling case and
`does not admit a real 'unsupported display' alongside advisory media`. The latter
is a newly discovered, independently reproduced baseline failure—not a passing
test. Strict checking retains the historical `src/snapshot.test.ts` omission.

Evidence lanes are `native-image-fallback-integration-september11-round01`,
`native-image-fallback-media-baseline-september11`, and
`native-image-fallback-integration-september11-round02`, all under
`node_modules/.cache/native-validation/`. The original failures remain unchanged.
The final run retains single-thread native tests, JavaScript network guards,
tool-child socket-denying seccomp and the existing time/output/resource caps.

An unchanged-capture Python replay is separately released against the final
immutable build. This gate itself proves neither real-site interaction nor
SafeJS, credential, device, socket, full image-model or styling acceptance.
