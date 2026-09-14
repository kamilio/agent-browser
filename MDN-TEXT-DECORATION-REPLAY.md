# Captured MDN text-decoration alias recheck

September 14, 2026. **Native diagnostic completed; interaction remains unproven.**
The standalone browser rechecks the original September 11 MDN querySelector
capture on committed runtime `d9933a1543d0fadbd02613a94fffdc4674b6f4c0`, after
the text-decoration alias fix. No captured HTML/CSS body is interpreted outside
the native browser. This is a fresh offline observation, not a new live visit.

The native observation runs **07:20:52.601–07:20:53.009 UTC**. It serves all 19
original captured resources/270,288 decoded bytes once each, with zero wire
requests, denials, scripts or clicks. Scope: one navigation, one default formatting
build, one cached diagnostic read, one hint query and existing bounded attribution.
No width resolution, geometry, rasterization, second page or additional assets.

## Measured compatibility change

Comparison is against the preceding diagnostics-runtime replay documented in
`MDN-CSS-DIAGNOSTIC-REPLAY.md`; neither historical result is rewritten.

| Native observation | Previous | After aliases |
| --- | ---: | ---: |
| Raw unknown-property occurrences | 147 | 134 |
| Applicable unknown-property occurrences | 78 | 70 |
| Raw invalid/unimplemented-value occurrences | 30 | 31 |
| Applicable invalid/unimplemented-value occurrences | 15 | 15 |
| Formatting issue categories | 10 | 10 |
| Overlapping formatting issue occurrences | 220 | 212 |
| Retained CSS diagnostic occurrences | 128 | 128 |
| Omitted instrumented occurrences | 51 | 39 |
| Native cascade work units | 4,204,814 | 4,206,150 |

The extra raw invalid-value occurrence is expected and explicitly preserved:
the browser now recognizes `-webkit-text-decoration:underline wavy!important`
as the canonical property but still rejects the unsupported **wavy** value.
That retained sample has an unmatched selector in active media and is not
applicable. The corresponding unprefixed declaration remains rejected too.
This is not blanket suppression of vendor-property failures.

Eight applicable unknown-property occurrences disappear, although the previous
bounded snapshot retained only five matched/active alias samples. The earlier
five-sample count was never the complete applicable count. Sampling still has
`truncated:true` and `exhaustive:false`; fewer early failures expose later samples,
including matched/active `justify-items:center`. This does not prove a new
regression or complete coverage of remaining CSS.

The cached diagnostic read does not rebuild the cascade: before/after read
metrics are identical at build 1. Formatting metrics are unchanged: 1,954 visited
DOM nodes, 2,054 boxes including seven outside markers, 15,270 text units, 83,210
formatting work and 65 deferred subtrees. Rule/declaration counts remain 591/1,446;
generated-content work remains 65,503. All other applicable issue counts remain
unchanged. The 1,336-unit cascade-work increase and elapsed observation are not
a normalized performance, memory or speedup claim.

## Verification and limits

Prepared verification and independent parent verification pass. They recheck
the final native-gate/source binding, exact fixture and framework inventories,
scope counters, sample accounting, cache identity, owner cleanup, removed private
directories and absent supervisor process group. The previous evidence remains
unchanged. The runtime separately passes 22,512 selected native tests with two
unchanged exclusions; see `TEXT-DECORATION-ALIASES.md`.

Lane: `node_modules/.cache/native-validation/mdn-decoration-aliases-preparation-september14/`.
It contains the completed single run despite its preparation-oriented name.

- Result SHA-256: `3faf648ca64f9616706a4d433fbdf75250e8fb22d31b674a6113d4f6c2812ee8`.
- Verifier SHA-256: `5cff74647aba7d5bfeae368620f028de9682947c0e46f14090f45e0e388b9edf`.
- 35-entry evidence ledger: `454004643ac2ace844831fee86936c4253c8e4b70541494ac0d361dee7237906`.
- Parent proof in `text-decoration-aliases-work-september14/MDN-PARENT-OUTCOME-VERIFICATION.json`
  under the same cache: `18a70710335fdb21fc5e4e7f94b34e0aa080f8313a01ab856367d848810a4ccd`.

The matched `font:inherit` rejection persists. Next: implement coherent native
font-wide inheritance, then remaining sampled layout features and separately
recheck actions. MDN's querySelectorAll destination remains uncaptured. Broader
live sites/forms, original research, credentials/devices, SafeJS, socket, real
terminal and challenge gates remain open. No new domain, interaction acceptance
or CAPTCHA result is claimed. Overall goal active; nothing pushed.
