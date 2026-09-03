# Native email values and submission

September 3, 2026. Native email inputs now participate in validated form
submission instead of rejecting every nonempty value as unsupported. Single
and multiple address syntax share a dependency-free native validator; invalid
values produce the existing `type-mismatch` result and `invalid` event flow.

## Implemented behavior

- Single-address values strip CR/LF and trim ASCII whitespace. Multiple-address
  values trim each comma-separated token but retain interior newlines so malformed
  tokens cannot silently become valid addresses. Empty list tokens remain invalid.
- Syntax follows HTML's email production, not a mail-server deliverability rule:
  local dots and permitted punctuation are accepted, domain labels are ASCII
  letters/digits/hyphens with a 63-character maximum and alphanumeric endpoints.
  Local domains and punycode spelling are accepted. Quoted addresses, comments,
  domain literals, Unicode address strings and malformed labels are rejected.
- Both optional empty modes are valid; required empty values report
  `value-missing`. Read-only/disabled exclusions, invalid-event cancellation,
  submit listeners, async native dispatch and explicit validation bypass retain
  their existing shared form behavior. No DNS or network lookup is performed.
- Email's inapplicable min/max/step attributes no longer block submission.
  Applicable pattern/minlength/maxlength constraints remain explicitly unsupported
  for nonempty values rather than silently gaining an incomplete implementation.
- Setting/removing `multiple`, including Attr mutation paths and the page
  property, sanitizes current state without resurrecting removed whitespace.
  The existing input-state owner preserves clean/dirty defaults through copies
  and reset. Combined attribute/current-value text admission remains atomic.

Validation scans labels and tokens without recursive regex matching. ASCII edge
trimming uses bounded index scans, avoiding repeated suffix searches across long
interior whitespace. Production code does not import another engine or runtime.

## Native evidence

All eight initial regressions failed before implementation. The new 63-case file
covers syntax, comma lists, ASCII whitespace, required state, unsupported versus
inapplicable constraints, submit events, page setters, copies/reset, Attr mutation,
clean-value quota admission, an independent 1,280-candidate byte grammar comparison,
100,000-character local parts, 30,000-label domain chains, 10,000-address lists and
120,000-character whitespace runs.

The previously omitted `src/form-submit.test.ts` is explicitly allowlisted after
review: all cases use constructed documents and native events, without sockets,
guest execution or external sites. Its two obsolete unsupported-email cases are
replaced by the new email coverage. Six calendar fixtures now use valid nonempty
calendar strings so they still exercise unsupported constraints rather than values
already cleared by the earlier calendar sanitizer. Its 28 cases pass.

Focused validation passes 239 tests across seven explicit native files. An early
full run overlapped the trimming edit and timed out on the new whitespace case;
that mixed-source run is not a controlled performance baseline or a final pass.
No timeout, sample size or validation gate was weakened to address it.
An isolated HEAD snapshot containing only the owned helper/state/validation/test
patch typechecks and passes 3,972 tests across 143 available allowlisted files.
Production build, strict types for both changed test files and six-source
lint/format checks pass.
The final stable-source full native run passes 6,732 tests across 204 explicit
files. These runs use Node v22.22.0 and Vitest v4.1.10 on Linux x86_64.

## Remaining scope

These tests exercise native form dispatch and host-object fixtures, not actual
SafeJS, public sites, framework applications, socket transport, TTY/PTY or UI
acceptance. No separately gated probe runs for this checkpoint. IDN display/input
conversion, UI bad-input state, email length/pattern validation, complete validity
APIs and native focus/error presentation remain open. Calendar/number constraints,
range/color sanitizers and the broader browser acceptance requirements remain open.

Primary reference reviewed September 3, 2026:
`https://html.spec.whatwg.org/multipage/input.html#email-state-(type=email)`.
Its single/multiple sanitizers, multiple-attribute changes, email grammar and
applicable-attribute list inform the native implementation. Specification review
is not evidence from another browser or a real mailbox.
