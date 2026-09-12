# Native empty-image layout

## Supported behavior

Stable images representing no content retain an ordinary native replaced box
with zero intrinsic width/height and no intrinsic aspect ratio. This does not
remove the DOM node or erase author styling. Width/height hints and supported
CSS dimensions, min/max constraints, edges, backgrounds, outlines, positioning
and hit identity remain effective. Rasterization paints the box, not fabricated
image pixels; empty images do not increment painted-image metrics.

The supported profile includes missing or exactly empty src with missing/empty
alt, and terminal broken images with explicitly empty alt. Native owner state
must be complete, with zero natural dimensions and no decoded resource. Pending
and loaded images keep their existing behavior. Missing alt with nonempty src
remains unsupported rather than silently discarding the expected indicator.

Nonempty alt also works when src is absent, empty or invalid. Existing standards
text and quirks dimensioned text-alternative paths are reused. Actual image
errors, completion, decode rejection, events and request accounting remain
observable; rendering authored alternative text does not fetch image bytes.

Policy-denied and resource-limit images are not admitted as empty boxes. Existing
nonempty-alt rendering for terminal denied/limited images is retained: the error
is not cleared and restrictions are not bypassed. Owner-wide failures still
propagate. Presence of srcset, crossorigin or referrerpolicy and an immediate
picture parent remain conservative fallback-profile exclusions.

The sizing resolver admits a zero intrinsic axis only when preserveAspectRatio
is explicitly false. True, omitted and malformed runtime flags retain rejection
for zero axes. Its existing independent-axis sizing path applies constraints;
no division by zero, invented ratio or universal300x150 fallback is introduced.

## Evidence and limits

IMAGE-SEMANTICS-SOURCE.md records a separate native primary-source capture of
represented-content cases and the complete getter. BROKEN-IMAGE-SOURCE.md retains
the earlier rendering source, including its first-applicable pending/missing-alt
and quirks branches. The zero/no-ratio native descriptor is an explicit bounded
sizing policy, not proof of full HTML image-state or CSS interoperability.
The full current/pending/availability state definitions remain uncaptured.

The original Selenium image-loaded replay is unchanged: on native14922, e168
without src/alt remained the sole element-layout-not-supported issue and the
used-layout attempt failed. Neither that evidence nor the historical15065 gate
is relabeled as a new successful website run by this implementation.

New canonical tests establish a clean15065 red baseline of0passed/3failed, then
3passed after the initial fix. A later180-case focused run passes after updating
the intentionally changed empty-alt mutation expectation. Four new suites cover
canonical geometry/memory-route navigation, independent zero-axis sizing,
layout coordinators/paint/hit limits, and native image state/mutation lifecycles.
Initial fixture errors and failed integration candidates remain in private
empty-image-work-september12 lanes at their original paths.

Broader tests caught54 regressions from an overly restrictive draft text-fallback
guard. Removing those new guards restores pre-existing nonempty-alt behavior;
the54 established tests are not rewritten to hide the regression. Three old
quirks source-less text cases and five old standards empty/text cases intentionally
change outcomes without changing case counts. A separate unrelated intrinsic-width
grid expectation discovered outside the historical selected gate remains untouched.

Independent adversarial review also reproduced a prepared-paint failure: an
asynchronous owner scan-budget failure closes the image owner without changing
the document revision. A draft empty-paint path skipped that owner and returned
pixels. Visible empty-image painting now validates the native owner before box
painting, preserving its resource-limit exception. A new state regression and
the retained independent failing probe cover this case; no extra image request
or decode is introduced. The corrected focused run passes765cases.

The first broad candidate run, native-empty-image-september12-round00, retains
15418passed/2failed/2excluded at18:23:48.418–18:27:08.340UTC on September12,2026.
Its two old expectations assumed an unselected img must be deferred and that a
source-less inline alternative has only one owner. The updated tests explicitly
assert a zero/no-ratio replaced node and both clear-free inline text owners;
other special elements and control behavior retain their guards. That run also
predates the independent prepared-owner fix, so it is not final acceptance.
Prepared round01 was never executed; the final candidate uses a fresh round02.

## Final selected native gate — September 12, 2026

native-empty-image-september12-round02 passes **15421/0/2unchanged exclusions**
at18:28:47.411–18:32:05.312UTC. Build, strict TypeScript and owned-file formatting
pass. The explicit clean manifest has673entries;295suites and294strict roots are
selected. There are1181source/1992compiled files and1168unchanged tracked inputs.
Twelve owned source/test files plus the manifest are the runtime snapshot delta.
The356new cases are3canonical,22numeric,203layout and128state cases; existing
case counts are unchanged. The final focused gate passes886cases across12suites.

Independent review passes4/4 with the formerly failing prepared-owner test bytes
unchanged. Main's18:29:20.306UTC read-only receipt check verifies those production
bytes and retained test identity; it does not rerun a page or make a request.
These results are not evidence of a new successful live Selenium navigation.

Native test results do not establish live navigation, website-wide support,
SafeJS, socket, real terminal, credentials/providers, passkey devices, research
completion or challenge acceptance. Those gates remain separate in TASKS.md.
