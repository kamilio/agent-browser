# Bounded CSP response evidence

Native research captures now emit `selected-response-headers-v2`. In addition
to the original five selected fields, they preserve `content-security-policy`
and `content-security-policy-report-only` separately. This fixes a diagnostic
gap: a v1 receipt with no omitted headers never established CSP absence because
neither CSP field was selected in that version.

## Representation and limits

- Exact value order, duplicate policies, whitespace and empty strings survive.
- The original five fields retain their 16-value and 160-code-unit-per-value
  limits. Each CSP field allows at most 16 values and 16,384 cumulative UTF-16
  code units. No header is truncated or partially retained.
- Invalid, accessor-backed, sparse, over-budget or non-Latin-1 fields are omitted
  as a whole and named in the ordered `headerCapture.omitted` list. Existing
  control-character checks remain. Header accessors are not invoked.
- Cookie, authorization and arbitrary response headers are still not captured.
  This is selective response evidence, not a complete HTTP archive or a secret
  sanitizer for arbitrary server-controlled policy strings.
- The existing overall evidence/metadata limits remain unchanged. Large escaped
  policy strings can still exceed the metadata budget and fail evidence output;
  the codec must not silently clip a policy to make the receipt fit.

With a validated v2 marker, an absent selected field that is not in `omitted`
means the normalized response supplied no such field. An omitted field means
its value was unavailable under these capture rules. With v1 or older evidence,
CSP presence and absence remain unknown. An empty supplied policy string is not
the same evidence as an absent header. Case normalization belongs to the native
transport, as for the other selected fields.

## Compatibility and enforcement

The receipt codec accepts both exact version markers. V1 keeps its original
five-field allowlist and budgets; relabeling CSP-bearing v2 evidence as v1 is
rejected. Unmarked historical receipts retain their original narrow validation.
Original reports and their measurements are not rewritten or upgraded.

Policy capture does not execute a script, resolve an asset, contact a report
endpoint, authorize a retry, or change CSP enforcement. Enforced and report-only
policies remain distinguishable. The native script loader's conservative CSP
refusal and the separate actual-SafeJS acceptance gate remain in place. Source
content may be readable even when automatic script execution is unsupported.
