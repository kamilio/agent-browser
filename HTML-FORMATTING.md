# Bounded HTML formatting reconstruction

September 4, 2026 continuation of `TEMPLATE-PARSING.md` and the seven-day browser
plan. The native parser now maintains active formatting state and repairs the
supported HTML formatting families instead of merely reporting that formatting
reconstruction is absent. This does not make the whole tree builder conformant.

## Active formatting state

`HtmlFormatting` retains original start-token attributes separately from mutable
DOM attributes. Reconstruction creates new native elements from those tokens,
updates active entries and the open-element stack, and inserts through the
parser's existing owner-aware/foster-placement path. Script changes to an old
element's attributes do not silently change the token used for a later copy.

The supported formatting families are a, b, big, code, em, font, i, nobr, s,
small, strike, strong, tt and u. Paragraph closure can leave their active entries
available for later reconstruction. An explicit end tag removes the relevant
entry even if the original element has already left the open-element stack.
Nested anchors and nobr entries receive formatting-aware close handling.

The list retains at most three equivalent entries after the current marker,
comparing original tag/attribute values independently of attribute order. This
does not delete the original DOM nodes or limit distinct attribute sets to three.

Markers isolate templates, cells, captions, applets, marquees and objects. When
their open-element frames are popped, entries through those markers are cleared;
outer entries remain available outside the boundary. A template fragment's
virtual context also starts with a marker. Ordinary comments and raw textarea
data do not cause unwanted reconstruction.

## Misnested-tag repair

The adoption-agency path handles formatting ends with a furthest special block,
including repeated repair across nested blocks. It preserves original nodes,
clones appropriate active intermediate entries, removes non-formatting entries
from the open-element stack, moves the affected DOM subtree, and updates the
active-list bookmark and replacement formatting entry.

The algorithm uses the standard eight-iteration outer limit and stops cloning
active intermediate entries beyond the inner-loop threshold of three. Those
limits are not replaced with unbounded retries. Scope checks prevent formatting
ends from crossing table, template, select and other HTML scope boundaries.

All native moves and allocations retain their existing resource and hierarchy
checks. Intermediate clones inside templates use the actual contents owner,
even when the common ancestor is the template host in another document. Foster
placement likewise remains inside the appropriate owner. Cached text-coalescing
references are discarded after repair so later text cannot land in a moved node.

“Adoption agency” here names an HTML parsing algorithm. It does not implement
DOM cross-document adoptNode or enable foreign-node append.

## Work and failure bounds

Parser formatting work is capped at the smaller of 1,600,000 visits and 64 times
the configured node limit. Original-attribute comparison text is capped at the
smaller of 16,000,000 code units and eight times the configured retained-text
limit. Limits must be positive safe integers and are snapshotted at construction;
later mutation of a native options object cannot increase them.

List/stack searches and repair traversal count toward the work budget, and
attribute-name/value comparisons have their own text accounting. Native node,
text and host-inclusive depth budgets still apply to every reconstructed copy.
The visit bound is not a wall-clock or complete memory measurement.

Cancellation is checked during repair, including after a native move callback.
Resource or cancellation failure closes the candidate parser document and its
associated contents owners. Existing fragment-based HTML replacement retains its
staging boundary; the formatter does not bypass native import/replacement checks.

## Marker membership follow-up — September 18, 2026

Marker synchronization now uses a lazy reverse scan and an identity set local to
that invocation. Each newly examined stack node is charged once, rather than
rescanned for each marker. The scan stops on a match, preserving the inexpensive
near-top single-marker case. Empty active lists allocate nothing. Membership is
never reused across stack changes; clearing still stops at the first missing
marker. Cancellation and all existing bounds remain in place.

Selected native tests pass 729/0 in 12 files, including 13 new regression cases.
A preserved Hacker News discussion that failed the formatting-work ceiling now
loads in 1,246,627 visits under the same 1,600,000 cap. This is not a wall-clock
speedup measurement. Whole-page Markdown still exceeds its separate 256,000-byte
output cap; bounded per-comment replay retrieves all 414 captured comment bodies
without increasing it. See `reports/source-linked-research-2026-09-18.md` for
fresh-request failures, offline validation and remaining limitations.

## Remaining compatibility

The parser remains an independent HTML subset. Broader malformed-table handling,
complete insertion-mode interactions and full scope/implied-end-tag recovery are
not established by the formatting fixtures. Foreign SVG/MathML construction,
namespaces, framesets, declarative shadow roots and content patching remain open
or explicitly unsupported. DOM adoption and cross-owner observer/runtime
integration are separate requirements.

Native tests use parser hooks and source fixtures, not a reference browser or
released SafeJS. No SafeJS, live website, socket or real TTY/PTY probe ran; the
previously denied SafeJS probe remains unrun. Runtime, live-site, terminal,
portability and release acceptance gates remain open.

## Validation

Three initial reconstruction/adoption regressions fail before implementation.
The final 57 new tests pass, with 242 focused checks across eight files. Coverage
includes all supported formatting families, markers, equivalent-entry pruning,
original-token attributes, intermediate clones, repeated repair, the eight-round
cap, template/foster ownership, cancellation during repair and work/native quotas.

On September 4, 2026 the explicit native suite passes 8,330 tests / 234 files in
the working tree and 5,570 / 173 available files in an isolated HEAD plus owned
patch. The isolated set excludes pre-existing untracked tests. Production and
changed-test typechecks, builds and five-file Biome checks pass in both trees.
Existing pending work remains outside the focused checkpoint, and historical
reports retain their original measurements. The seven-day goal stays active.

## Research

Reviewed the WHATWG HTML Standard on September 4, 2026: active formatting entries
and their three-equivalent-entry rule, reconstruction, HTML special/scope
categories, adoption-agency steps, and formatting start/end handling. The native
implementation retains separate ownership, resource bounds and explicit broader
parser limitations rather than treating a few repaired fixtures as conformance.
