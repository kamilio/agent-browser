# Live native JSON Pointer validation — September 16, 2026

One real anonymous GET to PyPI's Requests project JSON endpoint validates
--json-pointer /info through the actual native research CLI on committed runtime
d20b2f0b0162fdeb04b06850e5ba3c8466af7448. Before that request, the identical CLI path passes a synthetic
JSON proof under kernel and JavaScript network denial. This is not a retry of
the challenged package search, an alternate browser, or a CAPTCHA bypass.

At 2026-09-16T21:42:06.348Z, the response is HTTP200 application/json:
192973 decoded bytes and43299 encoded bytes. The body SHA256 is
bcfc6a202592e4e90f5a28ff002694eaa7c58ba741b76077f432b8bee1480111. It matches the earlier whole-response capture
at 2026-09-16T20:25:46.934Z; no earlier receipt or measurement is changed.

The selected /info object contains30 fields and yields5054 literal UTF8 bytes,
or5065 Markdown bytes including its balanced code fence. An independent Python
audit verifies the exact UTF16 source slice and decoded object against the full
body. Name, version, summary, Python requirement, project URLs and dependency
metadata are present with their expected data types. This verifies source
retrieval, not independent truth, package safety or installability.

This diagnostic intentionally captures the complete body for auditing, so its
actual CLI JSONL output is267849 bytes. Do not call that complete output a size
reduction: only the selected extraction is smaller than the earlier
192983-byte whole-document Markdown. The entire response is still downloaded;
no bandwidth saving, speedup or general site compatibility claim follows.

The request uses honest AgentBrowser identification, no credentials/cookies,
redirects, retries, page scripts, SafeJS, package installation, proxy rotation or
challenge solver. One native request and TLS connection are observed; both close,
with zero mocked live requests and no active resources. Native outcome remains
extracted-unverified/contentSuccess:null; the separate source audit establishes
the selection's fidelity, not rendered or factual acceptance.

The runtime's prior native gate is46,333 passed/0 failed across942 available
files in four isolated shards.22 manifest files remain missing. The checkpoint
read confirmation fix is separately documented in
reports/checkpoint-confirmation-2026-09-16.md. Actual credentials/passkeys/devices,
SafeJS/dynamic sites, rendering, crawler/access handling and unfinished research
remain separate gates. The overall browser goal remains active.

Evidence: node_modules/.cache/native-validation/json-package-field-live-september16/.
This publication changes reports/TASKS only and preserves42 dirty tracked and
697 untracked files. No additional GET occurs during the independent audit.
