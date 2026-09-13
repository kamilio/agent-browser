# Native validity selectors

`:valid` and `:invalid` now share the browser's native constraint validator.
They work in queries, matches, closest, logical/relational selectors and the
stylesheet matching path. They do not dispatch `invalid` events or submit forms.

## Matching scope

- A validation candidate matches according to its native constraint state.
  Barred ordinary controls match neither pseudo-class, even with a custom error.
- A form is invalid if an associated candidate fails validation. Ownership,
  including external `form` attributes and parser associations, matters rather
  than simple DOM ancestry. `novalidate` does not change selector matching.
- A fieldset is invalid if a descendant candidate fails validation, regardless
  of that candidate's form owner. This includes nested descendants. The
  fieldset's own custom message does not by itself make the container invalid.
- A form or fieldset with no failing candidates is valid, including when it has
  no candidates. The special container rules are not skipped merely because a
  fieldset is itself barred from ordinary constraint validation.
- Value, checked/selected state, custom errors, attributes, ownership and tree
  mutations are reflected on the next operation. Validity selectors mark the
  cascade as control-value-dependent, preventing stale value-only styling.

The candidate rules and constraints remain the existing native profile, not a
claim of complete HTML validation conformance. Unsupported constraints still
throw instead of fabricating successful state. A known custom error proves a
candidate invalid. Likewise, one known invalid member proves its aggregate
invalid even if another member has an unsupported constraint; without a decisive
invalid member, that unsupported state propagates. Resource-limit errors are
never swallowed by aggregation.

Native control-state selectors in detached trees retain their existing explicit
unsupported result. Form-associated custom elements, shadow-tree integration,
`:user-valid`, `:user-invalid`, full pattern validation and UI-only invalid input
buffers are not implemented by this change. Pseudo-elements remain unsupported.

## Bounded operation

Native control-index preparation accepts an internal work charger. It meters
node and attribute traversal, ancestry searches, option ownership and reverse
index construction before publishing a completed cache. A failed preparation
does not publish a partial index; a genuinely warm index avoids rebuild charges.
Existing unmetered control callers retain their previous behavior.

Selector validity uses operation-local boolean/error caches, shared radio-group
state and iterative subtree aggregation. Overlapping nested fieldsets reuse
computed subtree state. The selector's existing work and memo-entry limits cover
this integration; no limits are raised. Preflight charges control strings,
select/textarea traversal, radio groups and bounded file metadata. It never
copies upload bytes or retains input values in validity caches. Metadata array
allocation is separately bounded by the existing native file-selection limits.
Normal control-index and document owners retain their existing closure rules.

## Source and evidence

The complete WHATWG definitions for both selectors were admitted through a
fresh native semantic inspection of retained September 3, 2026 bytes. Original
source path: `/tmp/agent-browser-placeholder-spec-2026-09-03.html`; historical
metadata: `reports/placeholder-sources-2026-09-03.json`. The source URL is
`https://html.spec.whatwg.org/multipage/semantics-other.html#selector-valid`.
No new HTTP request or latest-publication claim is made for that investigation.

The complete lists establish candidates, form ownership, fieldset descendants
and empty-container behavior. Eligibility and custom-validity details were not
independently admitted; their tests exercise existing native contracts. An
optional read-only definition extraction fails after the core definitions are
retained. Its exit-one receipt remains intact, not relabeled a full source pass.

Evidence: `node_modules/.cache/native-validation/native-validity-selector-source-september13/`.
Body SHA256: `5d2aa5f0201086513d0bf16caf54216f3ccb9250a50d57579868ae693aa4aeb4`.
Ledger SHA256: `cb98ced2531bff27a486527dab1d6751d18231725295a75bd4672bcb0d122058`.

The new selector and control-index work tests cover native semantics, live
styling, owner/descendant distinctions, unsupported profiles, bounded failures,
memo reuse and closure. They are not proof of real SafeJS execution, operating
system interaction, upload submission, credentials, passkey devices or full
website rendering. Real-document observations retain their own dated reports.
