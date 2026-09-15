# Split-inline pointer ownership — September 15, 2026

## Functional change

The previous native RunRepeat root → review pointer workflow failed with
unsupported block-in-inline geometry before requesting the review. The fix
retains source inline ownership on normal-flow blocks moved into the formatting
parent, then exposes their **actual projected border boxes for native actions**.
It does not change source styles, invent a CSS box, force a click, bypass coverage
checks, or substitute keyboard/direct navigation. See `SPLIT-INLINE-ACTIONS.md`.

Production changes are limited to `src/formatting-tree.ts` and
`src/document-geometry.ts`. Ownership arrays are frozen and work-charged;
actionable rectangles use existing work/count bounds. Ordinary inline geometry is
unchanged. Ordinary split-inline CSS getters still reject unsupported ownership.

## Fresh native acceptance

Clean base commit: `c14b085dd05c2fefdd080a8aec612357c1d10987`, plus the four pinned owned
source/test overlays. Candidate `release02` uses a clean git archive, not the
unrelated dirty working runtime. Its source and compiled hashes were checked
before and after browsing. The final commit seal ties these tested bytes to the
checkpoint; the base commit alone is not claimed to contain the candidate fix.

- Root: `https://runrepeat.com/`.
- Observed source anchor: `https://runrepeat.com/brooks-revel-9`.
- Operation: native `session.click` on the anchor's current document reference.
- Result: **document navigation and 27,423 Markdown bytes** from the review.
- HTTP: **two HTTPS GETs, two HTTP 200 bodies, zero redirects/retries**.
- Event evidence: `mousedown`, `mouseup`, `click` targeted descendant node251
  and bubbled to requested anchor250. These are native mouse events, not a claim
  of newly supported DOM Pointer Events.

Exact timestamps, source href/label, response/body hashes and result-receipt hash
are in the adjacent JSON. Both trees closed exactly once; session/transport closed
with zero active requests, pending loads or cleanup errors. Both observed requests
and sockets closed, and the child/process group was reaped.

The reader remains partial source-level extraction. This establishes the tested
pointer-navigation path, not externally styled/scripted page parity, factual
verification of review claims, a new website ranking, or access/CAPTCHA recovery.
The earlier failed-pointer and successful-keyboard reports are retained unchanged.

## Saved-body control

The same two RunRepeat bodies from the previous sealed keyboard run were supplied
to baseline and candidate via synthetic native transport under kernel socket
denial and the existing JavaScript network/process guard.

- Baseline pointer rejects without the second request; explicitly selected
  keyboard activation then navigates to provide a control extraction.
- Candidate pointer emits the expected mouse sequence, navigates, and extracts.
- Root and destination Markdown are **byte-identical** between versions.
- Four synthetic requests total; four trees closed exactly once; guard recorded
  zero real network/process attempts. This is not an additional live run.

## Validation

| Check | Result |
| --- | --- |
| Clean baseline selected native tests | 518 passed, zero failed; 15 files |
| Old production plus identical final tests | 518 passed, 16 expected failures |
| Candidate selected native tests | 534 passed, zero failed; 16 files |
| Candidate build / strict selected types / formatting | Passed |
| Candidate lint | 13 pre-existing diagnostics, zero new diagnostics |

Sixteen new tests cover ownership, nested and multiple owners, source mutation,
immutability, sibling/gap exclusion, padding/borders versus margins, honest CSS
geometry, click/hover event targets, clipping/coverage, hidden/inert/pointer-events/
ARIA restrictions and automatic root scrolling. One existing reader regression
now expects real pointer navigation; its explicit keyboard test remains separate.

The old-production type probe also rejects the new ownership field, as expected.
Lint equivalence compares rule, severity, message, exact highlighted source and
path—not raw shifted line numbers. No unrelated lint cleanup was bundled.

The first candidate run passed533 tests and failed one expectation that assumed
DOM pointerdown/pointerup events. The test was corrected to the existing mouse
contract without changing production. That run and original red run remain
archived; release02 and final red02 use identical final test bytes.

An independent read-only source review found no blocking defect. Split-specific
nested scrolling and mutation during mouse dispatch remain coverage follow-ups,
not demonstrated failures. Full CSS geometry and full-manifest/SDK acceptance
remain unproven. No dependencies, credential access, accounts, page scripts,
external browser, challenge solving, spoofing, cap increases or push.
