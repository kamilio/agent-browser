# Native text indentation

## Outcome

The native horizontal/LTR inline layout supports inherited `text-indent`:
signed lengths, percentages, bounded existing CSS math, `hanging` and `each-line`.
Computed font-relative lengths are inherited without recomputing against a
descendant's font. Percentages resolve against the owning block's inner width,
not an outer containing block or the remaining interval beside a float.
Percentages contribute zero during intrinsic measurement.

Indentation reserves space before wrapping and alignment. Soft wraps differ
from forced breaks; first-formatted-line eligibility handles anonymous blocks.
Tabs retain their physical content-origin stops. Glyphs, inline fragments,
atomic descendants, hit geometry and paint share the existing coordinate pass.
Floats retain physical exclusion edges; occupied in-flow width includes the
applicable indentation. Empty float-only intrinsic lines do not consume or gain
first-line indentation. No second renderer, source mutation or dependency is added.

The exact default `0px` path reuses a frozen descriptor while retaining numeric
bounds validation. This removes default-path parsing/allocation; no measured
timing speedup or broader performance result is claimed.

## Source and limits

TEXT-INDENT-TRANSFORM-SOURCE.md preserves the failed native W3C capture: one
successful HTTP response followed by a harness TypeError before parsing.
TEXT-INDENT-TRANSFORM-EXTRACTION.md records a separate successful native offline
extraction of that captured response and independent read-only verification.
Neither rewrites the capture failure or claims the latest remote revision.

The implementation follows the captured CSS Text rules within the existing
native profile. It does not establish general CSS-PSEUDO first-line, bidi,
vertical-writing or full Unicode typography conformance. Existing unsupported
writing-mode, overflow and other layout guards remain. `text-transform` is still
unsupported; HTML rich-button conversion remains separate unfinished work.

SELENIUM-SIMPLE-CSS-DIAGNOSTIC.md is historical evidence from the prior13769
release. Its four unsupported declarations remain that run's actual result.
This feature addresses indentation, not its three case-transformation issues
or a successful link click. No new live website pass follows from native tests.

## Tests and retained failures

There are200 new cases:108 CSS/parser/computation/inheritance cases,67 layout
cases,22 limits/ownership/recovery cases and three canonical geometry/hit/paint
cases. Another63 existing css-math-core cases are newly selected by the broad
gate; they are not newly authored. The existing text-property expansion test
changes its expected property count from seven to eight without a new case.

All lanes below remain in
`node_modules/.cache/native-validation/text-indent-work-september12/`.
Times are September12,2026 UTC. Failures are preserved, not relabeled passes.

| Lane | Actual outcome |
| --- | --- |
| baseline | Original13769,15:39:09.678–15:39:10.890:0passed/3failed at unsupported-profile guard |
| fixed00 | 15:52:14.952–15:52:20.518:406passed/2failed; old property count and unrelated old grid rejection |
| baseline01 | Original13769,15:54:59.995–15:55:01.754:135passed/1same old grid rejection |
| fixed01 | 15:55:15.124–15:55:21.918:574passed/1same old grid rejection |
| fixed02 | 15:59:05.361–15:59:11.839:491passed/1failed; float-only oracle used an intentionally unsupported uncoordinated intrinsic API |
| fixed03 | Unchanged duplicate of that failing float-only oracle after a failed patch; retained |
| fixed04 | 492passed/0failed; oracle now preserves the low-level rejection and tests coordinated shrink-to-fit geometry |
| fixed05 | 16:04:13.683–16:04:20.059:493passed/0failed across12 suites, including default-path bounds/identity |

The separately baselined97-case intrinsic-widths suite was absent from both the
previous and current broader selections. Its obsolete grid-rejection failure
is unrelated to indentation and remains unchanged. Subsequent focused lanes
omit that whole suite, not just its failing case. New owned intrinsic cases
cover percentage, signed/fixed/mixed lengths, floats and native coordination.
The float-only test correction does not remove a production guard or change
production code. Canonical geometry fixture bytes remain identical to baseline.

## Independent review correction

Initial round00 passed14017/0/2 at16:05:18.583–16:08:16.343UTC. Independent
review then found that a positive indent beyond the inner width incorrectly
used clamped fitting capacity for alignment and overflow. The passing selection
did not catch this; that uncommitted candidate and review remain original evidence.

Fifteen new cases cover left/start/center/right/end alignment with no/left/right
float. Direct glyph, hit, geometry and overflow assertions compare native leading-
margin controls. fixed06 at16:18:25.052–16:18:31.588UTC passes493 and fails all15
new cases. fixed07 at16:18:46.588–16:18:53.191UTC passes508/0 after correction;
formatting-only fixed08 at16:19:26.730–16:19:33.198UTC also passes508/0.

Signed remaining width now governs alignment, trailing-space measurement and
overflow; fitting capacity remains nonnegative. Exact zero-indent behavior stays
unchanged. No empty soft line or clamped specified indent hides the overrun.
FINAL-REVIEW.md and FINAL-REVIEW-FOLLOWUP.md in the private work directory retain
the independent finding and follow-up scope; no general conformance is claimed.
An initial incorrectly named runner invocation failed before test execution, and
a read-only formatter finding was corrected before the final broad gate.

## Broad validation and provenance

Immutable lane:
`node_modules/.cache/native-validation/native-text-indent-september12-round01`.
Build, strict check, formatter and explicitly selected native tests pass during
2026-09-12T16:19:48.215Z–2026-09-12T16:22:46.942Z:
**14032 passed, zero failed, two unchanged exclusions**. The exclusions remain
the host-object-ceiling and real unsupported-display scenarios, not new skips.

The gate selects271 suites and270 strict roots from a clean661-entry native
manifest. It is not an assertion that every manifest entry was executed.
The audited snapshot contains1165 source and1976 compiled files;1156 tracked
inputs are unchanged from base481ca57291090c9c712a2c11a96fb9797040229e.
Eight owned source/test inputs and the clean manifest are the changed inputs.

Source inventory SHA256:
`9e44ff6966c57149f3a368a3c72f3c42bd169f5a254e176eb44426204ad1d94d`.
Compiled inventory SHA256:
`3a992f4d417c01e86ae96fe7f7bc9d83b536e08174a6fb8aec739388f4e1ccb4`.
Native results SHA256:
`ac914874ed131c6fbffec9a8f9aaa993720cae9e3c24bd74f4db5518f263d06a`.
AUDIT.json, results/SUMMARY.json, source-before/source-after inventories and the
subsequent COMMIT-VERIFICATION.json retain the exact evidence and release binding.

Execution uses kernel socket/socketpair denial and private HOME/TMPDIR with the
existing native compiler/formatter/runner. No website, real socket/device/TTY,
credential/provider, passkey-device or SafeJS acceptance is implied. Three
pre-existing manifest additions,927 pre-existing TASKS lines and unrelated dirty
source remain outside the feature commit. No dependency or push is added.
