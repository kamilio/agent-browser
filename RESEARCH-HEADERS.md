# Bounded response-header evidence

September 17 update: `RESEARCH-CSP-EVIDENCE.md` defines version 2, which also
captures bounded enforced and report-only CSP fields. Version 1 receipts retain
the five-field contract documented below; they do not establish CSP absence.

New native research response summaries retain selected header values without
clipping them. This keeps challenge and retry evidence available to capture
inspection and replay without exposing general response headers.

The fixed selection, in order, is `content-type`, `content-length`,
`content-encoding`, `cf-mitigated`, and `retry-after`. Each present field must have
1–16 string values, each at most 160 code units. Values allow Latin-1 characters
except control characters other than horizontal tab and exclude DEL. Whitespace,
order, duplicates, conflicts and empty strings are preserved exactly.

An invalid or over-budget field is omitted **in full**, not clipped to a value
prefix that could hide a conflict. Absent fields are not invented. Cookies,
authorization, location and arbitrary headers are not part of this selection.

Every new `primaryResponse` summary adds:

```json
{
  "headerCapture": {
    "kind": "selected-response-headers-v1",
    "partial": true,
    "omitted": []
  }
}
```

`omitted` lists present selected fields that could not be retained, in the fixed
order. It is not a list of all headers excluded by the selection. An omitted
field cannot also appear in the captured headers. The marker describes a partial
selection, not complete HTTP or classifier equivalence.

## Validation and compatibility

The evidence codec validates explicit markers and selected values before default
serialization, long-profile serialization, and replay metadata processing. It
rejects malformed or unknown marker fields, invalid header names/values, repeated
or out-of-order omissions, and retained/omitted conflicts. Bounded long-profile
metadata projection retains the marker rather than silently discarding it.

Receipts without the marker remain legacy evidence. Their existing three-header,
two-value, 160-code-unit checks are unchanged at validated-capture admission and
long-profile validation; default legacy serialization remains its existing
passthrough. Legacy evidence is not silently upgraded to accept new header names.
Historical receipts and measurements are not rewritten to add missing values.

Explicit-marker default reports are detached, validated and emitted from the
same data snapshot, rejecting hooks rather than validating one graph and
serializing another. Root/primary proxies and accessor-backed primary values
are rejected before marker inspection. Default emission does not acquire the
long-profile depth/property caps; long-profile and replay admission limits stay
unchanged. This preserves the existing default serialization envelope rather
than enlarging source, capture or extraction budgets.

Header arrays and marker snapshots are independent and immutable. The capture
helper reads only selected own data descriptors and bounded array entries,
without invoking value getters or enumerating arbitrary headers. Its input is a
trusted native transport header record: descriptor lookup is not a sandbox
against arbitrary hostile Proxy traps. The evidence codec separately rejects
proxies, accessors and unsupported object shapes during snapshotting.

## What this does not do

- Change the actual response, captured body, hash, status or existing receipt time.
- Infer a missing historical challenge header from its old diagnostic.
- Convert a barrier receipt into content-replay permission.
- Add automatic retries, delays, identity spoofing, CAPTCHA solving or authentication.
- Treat a native fixture or saved-body mock as a new live website validation.

The live classifier continues to inspect the actual original headers. A retained
`cf-mitigated` value supports later inspection/reclassification; an omitted value
does not. Retaining `retry-after` is evidence preservation, not a change to the
existing pacing or retry policy. A selection can still omit information needed
to reproduce a diagnosis, and declared omission must remain visible.
