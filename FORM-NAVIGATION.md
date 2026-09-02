# Native form submission and navigation

September 1, 2026. The session engine now connects submit activation to validation,
submit events, serialization, guarded HTTP and document replacement. This is
tested with constructed controls and real echo responses, **not parsed HTML or
website JavaScript**. No dependencies were added.

The later `HTML.md` checkpoint additionally verifies an actual parsed public HTML
form through type/fill/check/Enter and POST, without constructing controls, changing
attributes or bypassing validation. Website JavaScript remains disabled.

## Host SDK and CLI

`session.click(tabId, submitterRef, { signal? })` runs normal click activation,
then submits its form if the click was not canceled. Label-forwarded activation
also reaches that same submitter intent. The CLI's `click` uses this path.

`session.press(tabId, "Enter")` and CLI `fill --submit` now execute the supported
implicit-submission path. `KEYBOARD.md` describes focus, default submitter selection,
editing/textarea behavior and the current keyboard-versus-submit timing boundary.

`session.requestSubmit(tabId, formRef, formOptions?, navigationOptions?)` submits
without a click, optionally with a submitter. It still validates and emits
`submit`; it is **not** the validation/event-bypassing DOM `form.submit()` method.
Form options are the existing serializer options: explicit submitter, bounded
upload map, image coordinates, entry/byte limits and optional multipart boundary.
Navigation options carry an abort signal.

Both return a `form` result containing `formRef`, `canceled`, `recursive` and
invalid-control references/reasons, plus `navigation` only if navigation ran.
The session/CLI result does not include serialized values or upload bytes.
Validation failure and `preventDefault()` are successful handled actions without
navigation, not fake network successes or unsupported-action errors.

The lower-level `DocumentInteractions.forms.requestSubmit` returns a prepared
submission rather than performing I/O. Its optional `submission.request` contains
potentially sensitive serialized values; this is an explicit trusted-host API,
not a safe bridge to an untrusted page runtime.

## Event order and state

1. Require a live form and eligible associated submitter; guard recursive
   submission events for the same form.
2. Unless `novalidate`/`formnovalidate` applies, evaluate supported constraints.
   Invalid controls receive cancelable, non-bubbling `invalid` events. Canceling
   those events does not make the form valid. A listener's correction takes
   effect on the next submission attempt, not the original validation result.
3. Emit bubbling, cancelable, non-composed `BrowserSubmitEvent`. `submitter` is
   the internal element ID or null; this SDK does not yet expose page DOM objects.
4. After uncanceled listeners finish, re-resolve the form/submitter and serialize
   current successful controls. Listener changes to values, action/method and
   submitter overrides affect the request. Removed/reassigned submitters fail.
5. If a listener replaced the page or started newer navigation, do not overwrite
   it with the pending submission. Otherwise run the owned navigation pipeline.

Submission guards release even on serialization errors. Listener mutations and
already-transmitted network requests are not rolled back. Do not automatically
retry failed actions: an unsupported response/parser feature can follow a successful POST.
Cookie changes from responses may likewise occur without document replacement.

## Constraint scope

Implemented: required text/password/search/tel/URL/textarea, checkbox checkedness,
radio-group required state, select placeholder/nonselection rules, explicit
required upload presence, and absolute-URL type mismatch. Disabled/read-only
eligible controls, hidden/button/reset/submit/image inputs and datalist descendants
are barred as documented by the implementation. Radio groups are evaluated once
per validation pass rather than rescanned per member.

Unsupported constraints fail before network transmission: pattern, min/max/step,
minlength/maxlength, and email/number/date/time/range/color input validity. This
is deliberately conservative, including attributes irrelevant to some types.
No untrusted pattern is evaluated with the host regular-expression engine.
Explicit native no-validation attributes skip these checks, as they do required
validation. There is no fabricated standards-complete `ValidityState`.

The HTML checkpoint adds one explicit exception: empty email/number/date/month/
week/time/datetime-local controls validate emptiness (and fail when required),
without evaluating irrelevant range/pattern constraints on an absent value.
Nonempty values still require unimplemented type/constraint support and fail.

Custom validity, validation messages/focus UI, dirty/user-validity tracking,
`formdata` events and mutable FormData, complete keyboard submission semantics,
intrinsic FileList/upload commands, DOM `submit()`, dialog forms, other browsing
targets, and full control/type semantics remain missing. No full compatibility
row is completed by this subset.

## Network, lifecycle and reload

GET forms replace the action query with encoded successful controls. POST forms
send URL-encoded, multipart or text/plain bodies with source Origin through the
existing transport. Cookies use the source document's site context and top-level
navigation rules. Other named/new-window targets fail explicitly; self/top/parent
currently mean the same top-level tab because frame trees are not implemented.

POST always performs a request, even when action differs only by a fragment.
All response limits, DNS/private-network policy, redirect/TLS checks, cancellation,
atomic commit and late-result cleanup remain shared with ordinary navigation.
HTTP 204/205 and loader/network failures preserve the current document; successful
responses close the old tree. Stopping a request cannot undo server-side effects.

Reload of a committed POST result fails with an explicit resubmission-required
error. The engine does not retain body bytes for automatic replay or silently
replace POST with GET. A 301/302/303 conversion to GET permits ordinary reload;
307/308 preserve POST and its reload guard. Same-document fragments retain the
guard. There is no resubmission confirmation UI or unified cross-document history.

## Evidence

- `src/form-submit.test.ts`: event order/cancellation/recursion, required and barred
  controls, select/radio/URL cases, explicit constraint gaps, stale submitters,
  uploads, serialization limits and closure.
- `src/session-submit.test.ts`: GET/POST click execution, listener mutations,
  redirects/reload guards, 204 preservation, target policy, newer navigation,
  abort/late-response handling and CLI dispatch of invalid/valid submissions.
- `src/node-form-session.test.ts`: actual HTTP bodies, GET queries, Origin,
  redirect cookies and final methods for 301/302/303/307/308, HTML failure and
  denial of an unapproved private target before transmission.
- `scripts/check-form-navigation.ts`: two public httpbingo demo POSTs load echoed
  JSON into new documents. URL-encoded click and multipart requestSubmit verify
  post-event values, explicit file contents, old-tree closure and replay prevention.
  Controls are constructed in a loaded JSON document, not parsed from a website.

Build, then run `bun run --cwd packages/browser-agent check:form-navigation`.
Reports retain assertion metadata, response sizes and instantaneous whole-process
RSS, not credentials or echoed request bodies. RSS samples are not peak or general
HTML/JavaScript-browser memory claims. See `reports/README.md` for dated results.

Reference: WHATWG HTML form-control infrastructure, submission algorithm and
constraint-validation sections:
https://html.spec.whatwg.org/multipage/form-control-infrastructure.html
