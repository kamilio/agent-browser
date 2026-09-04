# Bounded HTML head insertion modes

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and behavior

Reviewed the WHATWG HTML parsing standard, last updated September 3, 2026:
`https://html.spec.whatwg.org/multipage/parsing.html`, particularly before-html,
before-head, in-head, in-head-noscript and after-head processing.

The parser now distinguishes those head-related states instead of combining
early parsing into one before/head transition. It ignores inappropriate early
end tags without prematurely starting the body, handles omitted head tags,
retains leading head whitespace, and places comments at the appropriate document,
before-head, head or after-head location. Repeated head starts do not overwrite
the original head attributes.

Disabled-scripting head noscript has its own allowed-metadata and fallback
transitions. Invalid body content closes the head noscript before reprocessing;
inappropriate end tags do not prematurely end it. Enabled-scripting noscript
retains the raw-text path. Noframes also follows the head raw-text path.

## Late head metadata

After-head metadata uses the saved native head identity for insertion, including
title, script, style, noframes and template. It does not leave a temporary head
frame on the open-element stack. A late script belongs to the head while writes
after its raw-text closure resume through after-head rules. The body remains
unattached until body construction, rather than appearing merely because the
head closing tag was read.

The saved head pointer survives a native hook detaching that head. Late CSP
metadata retains main-document policy hooks, while metadata and scripts in
template contents remain inert. Fragment parsing retains its separate roots;
the html-context fragment uses the head transitions without document-root
comment placement.

After-head whitespace checks actual adjacency so metadata inserted into a
different parent cannot split consecutive whitespace into extra text nodes.
These adjacency scans use the existing table/insertion work budget.

## Bounds and lifecycle

A tag can pass through at most eight head dispatch iterations; every iteration
checks cancellation and the existing input-work limit. The existing token limit
also applies to ignored tags that allocate no elements. Native node/text/depth
quotas and the existing scope, table and formatting work limits remain in force.
The pass cap is an operation bound, not a wall-clock or RSS measurement.

Raw-text pauses, parser writes, policy exceptions and cancellation retain the
existing candidate cleanup path, including associated template owners. No new
runtime dependency or page-runtime execution is involved in these fixtures.

## Remaining work

The native parser still preallocates its html/head/body scaffold and publishes
html/head before its first parsing checkpoint. This work does not establish full
standard DOM publication timing or arbitrary native reentrancy conformance.
Complete EOF diagnostics, fragment inheritance of the host document's quirks
mode, parser-created form-owner overrides, modern select behavior, foreign
construction, framesets, DOM adoption and cross-owner observer/runtime breadth
remain open. Framework and whole-browser compatibility are not established.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS probe remains unrun. Independent runtime, live-site, terminal, portability
and release acceptance gates remain open.

## Validation

Ten initial head-mode fixtures fail before implementation. An after-head
whitespace-adjacency regression also fails before its fix. The final 54 new tests
cover head states, omitted/duplicate tags, comments, whitespace, noscript modes,
metadata, template/fragment ownership, script writes, native head detachment,
policy hooks, cancellation and token limits. A pre-existing synthetic-paragraph
quota fixture now explicitly enters the body: its former bare paragraph end is
correctly ignored before head construction. Its quota assertion is unchanged.

The focused run passes 445 tests across ten files.

On September 4, 2026, the explicit native suite passes 8,569 tests / 238 files in
the working tree and 5,809 / 177 available files in an isolated HEAD plus owned
patch. The smaller isolated set excludes pre-existing untracked tests. Production
and changed-test typechecks, builds and three-file Biome checks pass in both
trees. Pre-existing pending work remains outside this checkpoint; historical
reports retain their original paths and measurements.
