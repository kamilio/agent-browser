# Lossless JSON source selection

Select a JSON value from a native text document without converting its numbers
or reserializing its contents. This is useful for public package metadata and
other JSON responses whose complete bodies are much larger than the requested
fields. It reduces returned extraction size, not downloaded response bytes.

## Usage

```sh
node dist/scripts/research-browser.js --reader --json-pointer /info https://pypi.org/pypi/requests/json
node dist/scripts/research-browser.js --reader --format json --json-pointer /engines https://registry.npmjs.org/typescript/latest
```

These commands make live requests; isolated native test authorization does not
authorize them. The registry tag is a requested resource, not a guarantee that
its contents are independently verified, safe to install, or current later.

The document API accepts `extractDocument(tree, { jsonPointer: "/info" })`.
Use `jsonPointer: ""` for the root value. The CLI accepts `--json-pointer ''`.
The saved-response API accepts
`extractResearchReplayJson(rawReceipt, trustedAdmission, { jsonPointer: "/info" })`;
its existing receipt hash, body hash/length, default-profile admission, byte
limits and cleanup remain required. The optional final format argument selects
`json` or `markdown`. It never fetches a missing response.

## Selection and fidelity

- JSON Pointer uses `/`-separated tokens, `~1` for slash and `~0` for tilde.
  An empty object key is selected by `/`. URI fragments and percent decoding are
  not supported. Array indices must match their canonical decimal spelling;
  `01` and `-` do not select array elements, but remain literal object keys.
- The full source must be valid JSON. Trailing garbage, comments, malformed
  escapes and duplicate object member names anywhere in the document are
  rejected, even outside the selected branch. Rejecting all duplicate members
  is an explicit ambiguity policy, stricter than ordinary JSON parsing.
- The selected substring preserves original whitespace inside the value, CRLF,
  Unicode, string escapes and number spelling, including integers beyond
  JavaScript's safe range, `-0` and `1e400`. Surrounding root whitespace is not
  part of the selected value. Values are not passed through `JSON.parse`;
  only validated object-key strings are decoded to resolve pointer tokens.
- Markdown returns the literal in a code fence. Structured output contains
  literal text, not a parsed JSON value. Re-parsing that text with ordinary
  JavaScript JSON parsing can still lose numeric precision. Unicode formatting
  characters remain source data and must not be treated as trusted instructions.
- `jsonSelection` records the pointer, value kind, start/end, source and selected
  lengths, and `duplicateMembers: "rejected"`. Offsets use decoded document-text
  UTF-16 code units, with exclusive end; they are not transport-byte offsets.

Only unchanged documents registered by the native text loader are eligible.
Ordinary HTML containing a `pre`, manually assembled trees and mutated text
documents are rejected. Explicit JSON selection also works on valid JSON
served as plain text; it does not reinterpret HTML as JSON or execute scripts.

## Bounds and incompatible modes

The scanner permits at most 2,000,000 source code units, 4,096 pointer code units,
128 pointer segments, 100,000 values and 128 nested containers. It validates
the entire bounded source rather than returning early after a match. The helper
supports cooperative checkpoints; document extraction remains synchronous and
bounded, with the surrounding CLI/replay cancellation checks retained.

Missing targets fail with `not-found`; malformed input and duplicate members
with `invalid-input`; scanner/output bounds with `resource-limit`. Existing
admission may reject an invalid saved receipt before selection is attempted.
Unsupported document/profile combinations do not become successful text reads.

Do not combine JSON selection with DOM selectors, sections, line selection,
heading/text discovery, main-content focus, text-prefix fallback or `long-v1`.
Saved replay requires an exclusive `{ jsonPointer }` selection. Exceeding the
output budget fails rather than returning a misleading partial JSON value.
Ordinary extraction without this option keeps its existing behavior.

This feature provides neither dynamic-site compatibility, schema validation,
package search, credential access, factual verification nor challenge bypass.
