# Native text-length constraints

September 3, 2026. Native form validation and live page validity now share
`minlength`/`maxlength` evaluation for text, search, telephone, URL, email and
password inputs and textareas. This continues the seven-day plan without adding
a runtime dependency or changing the independent native engine.

## Value and edit ownership

Length errors depend on a dirty value whose last edit was a user action, not
merely on a nonempty value override. `DocumentTree` owns a bounded set of element
IDs recording user-origin values. Native fill and keyboard mutations mark that
origin; ordinary native `setControl` and page value assignments clear it, even
when assigning the same string. State changes precede input listeners and update
the document revision, so previously held page validity objects refresh.

Canceled beforeinput actions, no-op keyboard edits, blocked keyboard insertion,
invalid mutation arguments and rejected text-budget writes do not change origin.
Default edits preserve dirty current values. Resets clear origin; clone/import
copy it independently with the existing current/dirty metadata. Type/multiple
sanitization clears origin when it changes the current value or resets dirtiness.
Detach preserves state; document closure releases all recorded IDs. No additional
value strings are retained in the metadata.

## Constraint policy

Lengths count UTF-16 API-value units, including both units of a surrogate pair.
Textarea CRLF/CR becomes LF before counting; hard wrapping does not add length.
Native fill reuses input value sanitization, including trimmed email tokens while
preserving invalid interior newlines in multiple-email values.

Attribute limits use HTML nonnegative integer-prefix parsing: ASCII leading
whitespace, a plus sign and trailing non-digits are accepted. Negative nonzero
values and missing numeric prefixes are ignored; negative zero is zero. Bounds
above the largest safe integer saturate there, beyond any representable native
string length, without allocating arbitrary-precision numbers.

Empty optional values are not too short. Conflicting nonempty bounds can set both
flags. Length attributes on other supported control profiles are ignored. Existing
custom/missing/type reason priority is retained, followed by too-long, too-short
and numeric reasons. Validation candidacy remains separate from the flags.

Direct native fill does not truncate an oversized value: its tooLong flag can
block submission. Keyboard insertion retains the existing prevention policy but
now uses the shared applicability and integer parser; deletion is still allowed.
Number keyboard editing remains explicitly unsupported rather than being enabled
as a side effect of this work.

## Native evidence

The initial four regression tests all fail before implementation. The dedicated
suite contains 63 cases covering parsing, applicability, edit provenance, API
lengths, events, clones, resets, atomic failures, closure and native submission.
Focused validation passes 381 tests across seven explicit native files. Build,
strict focused-test types and nine-source lint/format checks pass.

The full explicit native suite passes 6,997 tests across 208 files. An isolated
HEAD snapshot with only this owned source/test patch typechecks and passes 4,237
tests across its 147 available allowlisted files. Four old unsupported-length
expectations are replaced by the supported-profile coverage, not counted as new
tests. Runs use Node v22.22.0 and Vitest v4.1.10 on Linux x86_64.

## Remaining gates

Pattern validation, calendar/range/color constraints, independently decidable
flags within unsupported profiles, the invalid UI edit buffer, page length-IDL
reflection, synchronous page checkValidity/reportValidity and reporting UI remain
open. No SafeJS, live-site, socket or real TTY/PTY probe is authorized or run here.
Native fake-host and synthetic input evidence does not close those gates.

Primary references reviewed September 3, 2026:

- HTML maximum/minimum user-input length and API values:
  https://html.spec.whatwg.org/multipage/form-control-infrastructure.html
- HTML nonnegative integer parsing:
  https://html.spec.whatwg.org/multipage/common-microsyntaxes.html
- WPT script-set length validity expectations (reviewed, not run in another engine):
  https://github.com/web-platform-tests/wpt/blob/master/html/semantics/forms/constraints/form-validation-validity-tooLong.html
  https://github.com/web-platform-tests/wpt/blob/master/html/semantics/forms/constraints/form-validation-validity-tooShort.html
- Clone edit-origin comparison (source review only, no engine dependency or probe):
  https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/html/forms/text_control_element.cc
