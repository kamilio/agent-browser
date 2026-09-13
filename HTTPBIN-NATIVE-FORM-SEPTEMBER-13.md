# HTTPBin native public form check — September 13, 2026

**Live loading succeeds. Offline native field preparation succeeds, but the real
pointer submit is blocked by two fieldsets and the time input.** No POST occurs
and no public echo response or end-to-end form success is claimed.

## Fresh live observation

One native BrowserSession GET of `https://httpbin.org/forms/post` runs September
13, 2026, 18:51:40.726–18:51:40.878 UTC. HTTP 200 returns **1,397 bytes**, parsed
into **96 native nodes**. The normal loader reports zero external stylesheets and
zero image elements. Header/status and native parsed title/text classification
find no access, challenge or login diagnostic. The normal native UA and TLS remain
unchanged; no credentials, redirects, retries or additional HTTP requests occur.

The initial live harness then fails at native form discovery with `Unknown
document node`. This is a harness API mistake, **not a browser loading failure**:
`formControls` returns node objects, but the harness passed them to `tree.get` as
IDs. Its failed result, framework, source inventories and capture remain sealed.
No live field fill, pointer click or POST takes place in that invocation.

Original HTML SHA-256:
`d9cd9adbe7554d4e82a597d722dccdcea70c8dd918836670e3f9687531f54d74`.

## Corrected zero-HTTP preflight

A separate lane maps the native returned nodes to their IDs. It loads the exact
captured body through a native BrowserSession and retains the captured allowlisted
headers. **Full original response-header parity is not established**; this is an
offline control/formatting preflight, not a fresh live flow or full security-header
replay. No body, CSS, DOM, geometry or asset substitution occurs. The preceding
live native load observed no external CSS or images.

Run: 18:54:27.493–18:54:27.668 UTC. Native form `e11` resolves to POST
`https://httpbin.org/post`, with 15 associated controls and one enabled submitter,
`e93`. The source URL was explicitly chosen; the action/method/controls are read
from the native parsed form, not invented for the test.

Eight native semantic preparation actions succeed:

| Control | Native reference | Prepared synthetic value |
| --- | --- | --- |
| Customer name, text | `e16` | `Native Browser Test` |
| Telephone | `e21` | `202-555-0100` |
| Email | `e26` | `native-browser@example.invalid` |
| Delivery time | `e85` | `12:30` |
| Comments, textarea | `e90` | `Native browser public echo validation` |
| Size, radio | `e42` | `medium` |
| Topping, checkbox | `e60` | `bacon` |
| Topping, checkbox | `e66` | `cheese` |

These emit 19 ordered untrusted preparation events. The separate genuine
`session.click` on the submitter then fails **before any pointer or submit event**:

```text
Document width resolution requires an issue-free supported formatting profile: element-layout-not-supported (3)
```

The native formatting tree identifies the three deferred elements:

| Native reference | Element | Diagnostic |
| --- | --- | --- |
| `e28` | `fieldset` | `element-layout-not-supported` |
| `e52` | `fieldset` | `element-layout-not-supported` |
| `e85` | `input[type=time]` | `element-layout-not-supported` |

After preparation: 53 formatting nodes, 43 visited DOM nodes, 248 text units,
555 work units and three deferred subtrees. No outbound POST intent reaches the
adapter, no network POST is made and no echo is fabricated. The offline guard
would validate and deny an outbound POST; that branch is **not exercised** here.

## What this changes next

The eight values and choice states work independently of pointer layout. The
actual form cannot be submitted through the supported pointer path until the
three deferred elements are handled honestly. Another unchanged live request
would not repair this offline-reproducible rendering limitation, so none is made.

Existing code/documentation leaves default fieldset groove painting, visible
legend layout and interrupted borders unsupported; see `FIELDSET-CONTENT.md`.
The time input supports native value preparation, but its visual description is
not among the admitted control-rendering types. These are static implementation
leads, not a new computed-style attribution or proof that one change alone fixes
the page. Do not replace groove with solid, hide legends, treat the time input as
an unrelated text control, remove guards or bypass the pointer with requestSubmit.

## Validation, containment and measurements

Both phases reuse the unchanged audited alias runtime: **20,672 passed / zero
failed / two unchanged skips**, 402 selected files / 401 strict roots / 760
manifest entries. **No new native-suite run occurs in this checkpoint**; 358
manifest entries remain outside that selected gate.

Live limits are eight requests total, one potential public echo POST, concurrency
one, 250 ms pacing, zero redirects/retries, 2 MiB per response, 8 MiB aggregate,
2,048 request bytes, 15-second request timeout and a 30-second watchdog with
five-second termination grace. Actual live use is only **one GET, zero POSTs**.
Live output is 6,833 bytes; offline output is 10,528 bytes, both below 10 MiB.

The live phase uses outbound HTTPS and JavaScript process/addon/server-socket
guards, **not a kernel network seal**. Offline execution additionally uses the
retained kernel socket/process sealing launcher. No guard capability self-probes,
website JavaScript, SafeJS, actual credentials, providers, passkey devices or real
TTY/PTY are exercised. Empty private HOME/TMP directories and cookie jars are
used; owners close and both process groups are reaped and independently absent.

Single instrumented observations: live **0.14 seconds / 85.22 MiB peak RSS**;
offline **0.17 seconds / 88.48 MiB**. Different scopes, one sample each, both ending
without a successful submit: not a benchmark, speedup or successful-flow latency.

Static preflight caught and corrected missing native parsed challenge checks,
echo-error content leakage and incomplete surviving-process-group cleanup before
the live request. These are harness changes, not new native-browser behavior or
proof of the unexercised failure branches. The later node-ID mistake remains
explicitly preserved rather than relabeled as a native defect.

## Evidence

- Live: `node_modules/.cache/native-validation/native-httpbin-form-flow-september13/`;
  32-entry ledger `b6ba8f1b9a0256cd3c570818893ca6ddd600d9feea250927e3fe997d4d993c41`.
- Offline: `node_modules/.cache/native-validation/native-httpbin-form-offline-september13/`;
  28-entry ledger `4f0457a8619de7719eb90558e64047a9d7a489ee188823c7cf975659a83b9327`.
- Parent verification and review:
  `node_modules/.cache/native-validation/httpbin-form-work-september13/`.

Both ledgers, actual captured bytes, source/compiled/runtime/framework pins and
cleanup are checked. Private raw captures stay local; no echoed IP or arbitrary
echo headers are printed. Historical reports remain unchanged. Overall browser
goal stays **ACTIVE**, including broader interactions, performance, research and
the separately authorized credential/device/SafeJS/socket/TTY gates.
