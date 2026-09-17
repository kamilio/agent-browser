# Bounded behavioral challenge-shell diagnostics

Native research navigation recognizes a small, otherwise empty HTML shell whose
hidden main container contains the complete nested behavioral challenge controls.
This addresses a captured page that previously appeared as empty reader output,
or as a few branding/privacy words under the legacy source-reader interpretation.

The result is a **possible challenge**, not provider identification or successful
content retrieval:

```json
{
  "kind": "challenge",
  "provider": "unspecified",
  "confidence": "possible",
  "evidence": ["html-behavioral-challenge-shell"],
  "action": "stop-and-request-user-handoff"
}
```

The existing research outcome becomes `semantic-barrier`, with no extraction or
source-JSON recovery. Captured bytes/status remain evidence, not replay permission
to turn the blocked page into content. Confirmed header diagnostics retain
precedence; HTTP429 still stops without retry before structural inspection.

## Recognition, not a brand-string match

`browserChallengeStructure` inspects native parsed nodes. It requires an empty
HTML title, a body otherwise limited to the hidden challenge root and permitted
metadata/script/style nodes, distinct structural IDs/classes in the expected
ancestry, a conservative source `display:none` declaration, and a disabled
button-role control. Branding is optional and never used to attribute a vendor.

Real sibling content, duplicate markers, wrong namespaces, template/noscript
examples, script strings and escaped markup do not establish this structure.
Unsupported hiding forms are inconclusive rather than guessed. Explicit parser
diagnostics for incomplete tags/raw text/comments/declarations/doctypes, EOF-in-text,
unclosed templates/noscript and duplicate attributes prevent recognition. Bogus
declarations are also conservatively inconclusive, even if complete. Missing
doctypes and legitimate optional end tags are not blanket-rejected.

The core bounds the document to 512 nodes, depth 32, 32,768 inspected units and
1,000,000 retained text units; individual attribute counts/sizes are bounded too.
It returns only the structure discriminator, not raw markup, IDs, script contents
or arbitrary attributes. It does not mutate the tree or execute scripts.

## Reader/source boundary

Reader sanitization intentionally omits source style and disabled attributes.
The integration does not weaken that policy or reconstruct missing attributes.
Instead, a separate bounded pre-sanitization check admits only explicit HTML
responses of at most 32,768 bytes/code units, then parses an owned inert tree only
when decoded source contains the literal root marker. It uses 512-node/depth-32
limits, no script or resource-fetch callbacks, and closes its tree on every path.
Source-admission byte copies are cleared; original response bytes remain intact.

Unsupported, oversized or incomplete source is inconclusive. This is not a
general declaration that an unrecognized page has no challenge. Declared Markdown
and larger hidden shells remain limitations of the raw-source path. The native
research, unfiltered visibility-evidence and admitted HTML replay paths use this
check; it is not a new standalone browser engine or CAPTCHA-solving runtime.

## Access and validation boundaries

This change does not solve challenges, spoof fingerprints, rotate identities,
relax access restrictions or automatically retry. It prevents a known challenge
shape from being mislabeled as empty/useful source. Human handoff and actual
dynamic-page/browser acceptance remain separate work.

`reports/behavioral-challenge-2026-09-17.md` records saved-response diagnosis,
native tests, 96 bounded historical source checks, and fresh Edmunds/Best Buy
observations. The fresh Edmunds response is a different HTTP403 page—not a live
reproduction of the historical hidden shell. Best Buy's hidden streamed content
can be inspected explicitly as source; its default placeholder is not repaired.
