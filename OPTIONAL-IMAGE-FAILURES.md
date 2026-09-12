# Optional image failures and navigation lifetime

The existing native image/session pipeline treats an individual image request
failure separately from cancellation of the whole navigation. The man7 manual
attempt in `MAN7-MANUAL-FLOW.md` stopped because its harness aborted the shared
navigation controller after rejecting a tracking image, not because the native
image owner inherently requires every optional image to load successfully.

This change adds regression coverage; it does not replace the transport or
change production behavior. A fresh live policy follow-up is separate evidence.

## Verified native behavior

`src/image-session.test.ts` adds five checks using isolated mock transports:

- A local `policy-denied`, `network-error` or per-image `aborted` exception
  retains the original image element and produces its native broken/error state.
  Original CSS still loads, another image completes, and error/load events have
  the expected owners. A genuine visible link click navigates to the next page.
- Two images sharing one denied source produce one request. Changing just one
  source can load an allowed image without retrying or repairing the other one.
- Aborting the navigation itself remains fatal. The old displayed page and
  history remain intact; the canceled candidate document, image owner and event
  owner close with no retained nodes, image resources or event listeners.
- Replacing a successfully loaded page also closes the observed old image/event
  owners. These are non-empty owner observations, not empty-array assertions.

The tests install capture listeners through the existing document initializer;
they do not create an image owner before the loader configures its fetch adapter.
They neither remove failed resources nor synthesize successful image responses.
They do not establish real socket cancellation or real website compatibility.

## Policy boundary

A resource adapter can reject a disallowed image locally while keeping its
origin/network allowlist closed. That is distinct from broadening the allowlist,
silently deleting the element, bypassing a server restriction or claiming the
page rendered correctly. A caller may intentionally impose a stricter stop
policy; that decision must remain visible in its report.

The bounded live follow-up still stops at actual HTTP failures, Retry-After and
classified access restrictions/challenges. Local image privacy-policy rejection
does not authorize retries, fingerprint spoofing, credential access or bypasses.

## Isolated evidence

On clean `99108ab454de37e7b89786cc4b95388c7d56d0ea`, the prior four-suite
baseline passes 180 checks, September 12, 2026,
02:09:11.917–02:09:15.132 UTC. The candidate passes 185 checks with the five
new cases, 02:09:15.379–02:09:18.637 UTC. Both have zero failures/exclusions
and unchanged source ledgers. There is no red production baseline: this confirms
existing behavior and localizes the earlier failure to harness policy.

The sealed `native-optional-image-september12-round01` gate passes build,
strict checks, formatting and 11504 selected tests, with zero failures and the
same two exclusions, 02:10:06.951–02:12:30.503 UTC on September 12, 2026.
It includes 204 selected suites, 203 strict roots and 599 clean manifest entries.
The existing manifest-listed image-session suite contributes seven prior cases
and five new cases to this selected gate; no manifest entry is added. Parent
audit verifies 1091 source files and 1928 compiled files. All 1928 compiled files
are byte-identical to the preceding physical-float release. Separately recorded
legacy grid failures outside this selection remain; this is not an all-repo pass.

Private evidence: `node_modules/.cache/native-validation/optional-resource-work-september12/`.
The native-only suite uses the explicit manifest, OS socket denial, private
HOME/TMP and the existing native guard. No website, credential/provider, real
SafeJS, device or TTY acceptance follows from these isolated checks.
