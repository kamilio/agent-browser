# Document-owned pending CSS declarations

September 4, 2026. Pending shorthand components now have shared native state
instead of depending on a lossless round trip through the `style` attribute.
This continues `INLINE-STYLE-PRIORITY.md` without adding a runtime dependency.

## Behavior

Variable-containing shorthands expand into ordered longhand slots. Each pending
slot retains its source shorthand, original variable expression and importance.
CSSOM enumeration exposes those longhands; individual pending values serialize
empty, while a complete compatible group reconstructs its authored shorthand.
Removing one component or replacing it at a lower priority no longer throws
`unsupported` or silently restores the original important component.

The renderer consumes the same document-owned slots before resolving variables.
Remaining components stay live when custom values change. Native cases cover
margin, padding, border families, flex, flex-flow, overflow, gap and background,
including computed values, geometry and software pixels. Source order and
importance are applied per component, not by replaying an overlapping shorthand.

The public entry point exports `inlineDeclarationLimits`. Command capabilities
advertise expanded native slots, partial removal, component reprioritization and
the document-owned retention profile. Related existing custom-property capability
metadata is integrated; unrelated pending capability changes remain separate.

## Serialization and ownership

The CSSOM serialization algorithm can emit empty longhand values for incomplete
pending groups. Consequently the serialized attribute alone cannot reconstruct
all retained state. The algorithm was researched read-only at
`https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block` on September 4.
No real-browser or upstream WPT execution is inferred from that research.

`DocumentTree` owns validated, frozen declaration projections. Every inline CSSOM
owner and native style/layout reader uses that state. Closing one CSSOM bridge
does not erase a document's styles. Detached elements retain their state; document
close drops the store and CSSOM owner references. Already returned immutable native
observations are not forcibly reclaimed from callers.

Raw `setAttribute`, attribute-value/node replacement, removal and `cssText`
replacement parse the serialized text afresh, even if its bytes are unchanged.
This intentionally drops unrepresentable pending slots. Native cloning follows
serialized attributes and does not share the source element's hidden state; this
is not a claim of complete cross-browser cloning/adoption conformance.

CSSOM caches check shared-state identity as well as attribute text. Publication
updates style state before native attribute notification, and a reentrant observer
cannot cause the outer operation to recache stale slots. Admission validates and
freezes a candidate before changing either the attribute or retained state.
Quota/source-validation failures preserve both. This does not promise rollback
of arbitrary effects from native callbacks after publication.

## Bounds and repeated work

Per document, retained pending state is limited to 512 elements, 16,384 declaration
slots and 2,000,000 accounted UTF-16 code units; an individual value is limited to
65,536. Accounting includes serialized source, names, normalized values and source
shorthand names. Removing/replacing the last pending slots releases admission.
The existing per-CSSOM-object and DOM text bounds still apply independently.
These are per-document retention limits, not total-process or peak-RSS guarantees.

Shorthand parsing is shared across its expanded slots within admission and style
rebuilds. The long-source retention regression also exposed quadratic whitespace
trimming; explicit end scans replace that regex. Initially its test took about
30.17 seconds and timed out. After both corrections, the original sixteen-case
file's test bodies completed in 87 ms locally. These are diagnostic observations,
not a released-runtime benchmark or a general throughput claim.

## Evidence and remaining gates

Thirty-five new native cases cover component behavior, cross-owner/cache identity,
same-text resets, reentrancy, frozen projections, three retention quotas, failed
admission, cleanup and capability exports. Nineteen selected existing-API cases
fail on prior HEAD with only test/limit-module setup and no engine changes.
Seven related pending inline-CSSOM cases are integrated; former unsupported-path
assertions now verify the implemented behavior rather than changing old reports.

Both trees pass production typecheck/build, strict checks of three affected test
files and eleven-file lint. The new test file is explicitly allowlisted.

Focused runs pass 253 tests across seven working-tree files and 201 across six
isolated files; the difference is the preserved pending custom-property suite.
Authorized full native runs pass 9,687 / 270 working files and 8,541 / 248 isolated
files. These use actual filesystem ownership, not additional probe authorization.
Validation also required authorized cleanup of four completed `/tmp` snapshots
after disk exhaustion; repository data, historical reports and logs were retained.

This does not complete CSSOM shorthand serialization ordering, every `all`
interaction, registered properties, prototypes/coercion, framework compatibility
or browser-equivalence acceptance. The historical invalid-priority-removal
divergence remains explicit in `INLINE-STYLE-PRIORITY.md`. No site, socket, real
TTY/PTY, browser or SafeJS probe ran; the previously denied SafeJS probe is unrun.
Historical evidence and unrelated work remain intact. The seven-day browser goal
and the original runtime, portability and compatibility gates remain active.
