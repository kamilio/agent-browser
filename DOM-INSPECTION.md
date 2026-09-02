# Native DOM inspection

Status: September 2, 2026. This is a bounded read of the engine's actual document
model, not a second parser, accessibility snapshot, CSS box tree or DevTools
implementation. It observes interpreted mutations and native control state.

## Agent API and CLI

```bash
agent-browser -s=research dom
agent-browser -s=research dom '#content' --depth=2 --max-nodes=128
agent-browser -s=research dom e12 --depth=0
agent-browser -s=research styles e12
```

`dom` is an additive agent command. It accepts an optional stable reference,
unique CSS selector or supported literal locator (`TARGET-LOCATORS.md`);
ambiguous selectors and detached/foreign/stale references
fail explicitly. `inspectDom(tree, options)` exposes the same operation from the
TypeScript package; its `root` option is a stable ref. The existing `styles` command remains separate and covers
only the documented visibility subset, not complete computed style or layout.

The result includes document/root refs, revision, preorder nodes, relative depths,
native parent refs, node kinds, names, attributes, text/comments and current
control values/flags. Hidden nodes are included. Child counts and
`returnedChildren`/`childrenTruncated` distinguish omitted descendants from empty
elements. A scoped root retains its actual parent ref, even when that parent is
outside the returned subtree. Reads neither mutate the document nor consume the
agent's snapshot-diff baseline.

## Limits and privacy

| Option | Default | Accepted range |
| --- | --- | --- |
| `--depth` / `maxDepth` | 4 | 0–64 |
| `--max-nodes` / `maxNodes` | 256 | 1–2,048 |
| `--max-code-units` / `maxCodeUnits` | 32,768 | 1,024–262,144 |

Names are clipped at 256 code units, attribute values at 2,048, and text/current
control values at 4,096. At most 64 attributes are returned per node. Content and
fixed record allowances are charged against the aggregate code-unit limit;
per-field and overall truncation remain explicit. This is **not an exact JSON or
UTF-8 byte limit**: escaping and transport envelopes add overhead, and the command
service's separate response-byte limit still applies. Document view copies remain
bounded by the existing document limits; the inspector does not copy the next
node once its output-node/content allowance is exhausted.

Password/file input values are replaced with `[redacted]` in both original
attributes and current controls. This is not general secret sanitization:
ordinary input values, text, comments, script text and other attributes may be
sensitive. Treat the inspection result as private page content, not publishable
telemetry. The paired playground uses the existing authenticated session API.

## Playground

The DOM pane formats this response as inert text, with actual node refs. Its
reference/selector field scopes inspection to a deeper subtree; Root restores the
whole-document view. It follows the selected shared session/document and clears
stale output on invalidation, document changes and disconnect. Reads are checked
against the selected document ref before display. No website markup is inserted
as live HTML.

The pane requests depth 4, 128 nodes and 32,768 charged code units, with a separate
65,536-character display cap. This is a text/subtree inspector, **not inline tree
expansion, rendered highlighting, editable attributes, a styles sidebar or full
DevTools parity**. The terminal CLI can read the structured result; the keyboard
TUI does not gain a dedicated DOM mode in this change.

## Evidence

- `reports/dom-inspection-focused-2026-09-02.json`: 1,006 tests across 46 files,
  including 22 native inspector cases plus CLI parsing, shared command-host,
  playground formatter and existing terminal/browser regressions.
- `reports/dom-inspection-safejs-fixture-2026-09-02.json`: eight checks using the
  existing experimental SafeJS core. Interpreted attribute/HTML/control mutations
  appear in the real native inspector; both original and runtime password values
  are redacted, scoped truncation is explicit, and inspection preserves revision.

The formatter check uses actual post-script DOM data but does not launch or
exercise the observer UI. No new visual UI, live terminal, public website,
released-SDK or service-start gate ran. Existing permission denials were not
retried or bypassed. No dependencies or SDK changes were needed.
