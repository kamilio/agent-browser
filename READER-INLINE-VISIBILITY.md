# Opt-in inline display source filtering

The native research reader accepts an additional explicit policy:

```sh
node dist/scripts/research-browser.js --reader \
  --reader-visibility-policy source-hidden-inline-v1 \
  --capture-body --format markdown PUBLIC_HTTPS_URL
```

The API option is `readerVisibilityPolicy: "source-hidden-inline-v1"`.
Omitting the option preserves the existing default. The `source-hidden-v1` policy
still inspects only `hidden` and `aria-hidden` attributes, not inline styles.
Use the default reader when hidden source is itself the content of interest.

## Accepted source syntax

The new policy adds a conservative inline `display: none` predicate to the
existing source-attribute filtering. It respects declaration order and
`!important` within the inline declaration list. It does not compute stylesheet
cascades, execute scripts, implement layout, or claim rendered visibility.
External rules and runtime changes can disagree with this source-only decision.

Inspection is limited to 8,192 UTF-16 units and 128 nonempty declarations per
style attribute. Complex or uncertain syntax retains the content rather than
guessing: comments, escapes, malformed delimiters, `all`, variable-dependent or
unsupported display values, and excessive nesting are not filtered. CSS-wide
and multi-keyword display values are also outside this narrow accepted grammar.
Unrelated quoted strings and functions must not spoof a display declaration.

`visibility`, opacity, classes, IDs, `inert`, loading placeholders and
configuration-shaped text are not hiding signals. Source `display:none`
subtrees do not reopen when a descendant declares `display:block`. Literal
non-HTML response bodies and code examples remain text. Existing hidden-subtree
parsing limitations, source accounting and paragraph/list implied ends remain.
No dependency, page runtime or admission limit changes.

## Reports and safeguards

HTML reports carry `hiddenContentSemantics:
"source-attributes-and-inline-display"`, the selected `visibilityPolicy`, and
`sourceHiddenSubtrees`: source-subtree roots matching the selected visibility
rule outside an existing omission. A root may also have an always-omitted element
type; this is not a count of newly removed nodes or every hidden descendant.
Literal MIME reports retain policy provenance
with false hiding semantics and zero source-hidden subtrees. Notices distinguish
source filtering from computed CSS visibility.

The existing same-budget unfiltered diagnostic tree remains in use before
selected navigation/replay. Title, body and requested-operation evidence must
not disappear merely because it occurs in filtered source. Existing challenge,
login, response-status and resource-limit checks remain; this is not challenge
bypass or a way to enlarge the document budget. Replay requires consistent
policy declarations and matching semantics. Explicit output-limit recovery
retains the original failure provenance and selected policy.

Body capture still contains original source. Filtering is not a privacy boundary.
It adds parsing/inspection work and is not presented as a speed improvement.
Native source extraction is not interactive website validation.

## Validation scope

The follow-up uses pinned saved public responses, not new website requests.
Historical top-100 results remain in
`reports/top100-websites-2026-09-15.md`; attempts and nonempty text must not be
confused with functioning applications. Wider native/runtime/credential/passkey,
interaction and service acceptance gates remain open.

### September 15, 2026 results

Nine saved controls retain exact default and `source-hidden-v1` Markdown,
reader reports, normalized rooted DOM and heading/link signatures. The new
policy removes both Office configuration containers, selected by their actual
inline declarations rather than IDs or text shape:

| Saved source | Default Markdown bytes | Attribute-only v1 | Inline policy |
| --- | ---: | ---: | ---: |
| Office | 52,523 | 41,839 | 26,082 |
| PayPal | 11,784 | 11,547 | 11,547 |
| Microsoft | 17,999 | 17,963 | 17,942 |

Office's selected tree changes from 1,439 to 1,403 nodes compared with v1;
its source-hidden counter changes from 40 to 48. Other inline-hidden roots are
also omitted: the byte difference is not attributed solely to the two named
configuration containers. Both Microsoft unresolved price placeholders remain,
with unchanged text hashes. PayPal's retained counter digits are still source
text, not a validated financial offer or rendered animation state.

MDN, SQLite, Python, Hugging Face, Cloudflare and the saved Chrome error page
retain the same Markdown under v1 and the new policy. Chrome remains an HTTP404
source; filtering its navigation does not turn it into the requested article.
Hugging Face and Cloudflare's literal Markdown remains literal.

Separately labelled in-memory Office and PayPal responses exercise capture and
API replay. Office's actual offline replay CLI produces exactly the same
Markdown hash as its derived receipt. These are not live website reads, ordinary
replay reinterpretations of the original receipts, or new source-admission
claims. Four guarded offline children complete with unchanged source/compiled
pins, no network attempts, and closed process groups. All nine original source
receipts and bodies retain their hashes. A separate integrity recheck also
verifies all 100 top-100 receipts and 90 captured bodies without re-browsing.

Clean-archive validation passes all 1,525 selected native tests in 25 files:
189 new assertions and all 1,336 baseline assertion statuses preserved.
Build, scoped format and lint pass. Broad selected types still report the exact
pre-existing `src/snapshot.test.ts:83` TS2345 error, so the combined check is not
all-green. A separate 24-file strict type check passes while that old fixture
remains included in native execution. The first candidate's three new assertion
failures were test expectations about Markdown escaping and process-wide node
references; its logs remain intact. Production did not change between candidates.
Independent static review reports no actionable findings and pins all six
production files; it is not a substitute for the recorded runtime checks.

Machine-readable evidence: `reports/reader-inline-visibility-2026-09-15.json`.
Private local records: `node_modules/.cache/native-validation/inline-reader-visibility-september15/`.
No full native release, new live policy validation, push, or broader acceptance
gate completion is claimed.
