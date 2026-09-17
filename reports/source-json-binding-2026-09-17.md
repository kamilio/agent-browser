# Recovering source-delivered news summaries — September 17, 2026

## Outcome

The native API and offline CLI now recover **four correctly paired titles,
complete source descriptions and publisher article URLs** from the saved
Business Insider homepage: all twelve fields match an independently selected
and decoded source JSON span. No page JavaScript, SDK, network request, account,
credential or challenge solver is involved.

This fixes a concrete source-content gap, not a demonstrated HTML parser
regression. Normal script omission remains intentional. The implementation adds
an explicit inert JSON-binding operation and `--binding` CLI mode instead of
executing scripts, changing their MIME, or emitting them into ordinary Markdown.

## Exact source and baseline

- Original native capture: **September 16, 2026, 00:24:35.783 UTC**,
  `https://www.businessinsider.com/`, HTTP200, 600,353 decoded bytes.
- Receipt SHA256:
  `2eece874c92df7789c57ed5dfa8cbc3787424ccba17ddc06857c2bb0ee5cfdb3`.
- Body SHA256:
  `e65afec6eb51363e7852d087663f3ec172c62c55e42f010da4b666a76a0c5dfc`.
- The exact initializer occupies original-body UTF-8 byte range `[5782,74077)`;
  its SHA256 is
  `a0b5ba0a1d15ef935f04c193edbd35ea6a1ffe4b2b16a25273f1eb981346f705`.
  It is 68,267 UTF-16 units, larger than the unrelated source-literal helper's
  cap. That helper and cap remain unchanged.

The historical entry-page review remains navigation-only, with 10,158 Markdown
bytes under its recorded options. A current **document-scope** replay yields
23,084 bytes but still none of the four complete descriptions. The existing
application/json source selector correctly rejects this text/javascript script.
These are different operations; the larger document-scope output is not a
same-options performance improvement or a rewritten historical verdict.

## What changed

`selectHtmlJsonBindingSource` requires a unique closed inline classic script,
an explicitly named initial `const` binding, an object/array strict JSON literal
and a terminating semicolon. Duplicate source identity/attributes and duplicate
decoded JSON members reject. Calls, expressions and multiple declarators before
the semicolon are unsupported. Trailing source is ignored and its span is
explicitly marked unevaluated; the selected literal is not a runtime-value claim.

The existing raw-body `research-html-json` command accepts an explicit
`--binding IDENTIFIER`. Without it, both the old application/json requirement and
old output envelope remain unchanged. Binding output has a distinct envelope,
exact source spans and unrendered/unverified metadata. The native public index
exports the API, validator and limits. No dependency or default reader changes.

For this capture, select `scriptId: "fenrir-client-data"`,
`binding: "fenrirClientData"`, and only these pointers for indices 0..3:

```text
/meta/quickLinks/<index>/attributes/title
/meta/quickLinks/<index>/attributes/description
/meta/quickLinks/<index>/links/site
```

Do not substitute the unrelated content-service `links.self`, dump the enclosing
configuration, or describe these captured summaries as full articles/current
headlines. No destination URL was fetched. The recovered strings remain
unverified publisher claims from the September16 response.

## Verification

| Gate | Result |
| --- | --- |
| Final seven-file native gate | **907 passed, 0 failed**, including 256 new cases |
| Build and selected test types | Pass |
| Scoped five-TypeScript-file format/lint | Pass |
| Saved-source API | All twelve values match independent source expectations |
| Twelve actual compiled CLI runs | Each selected JSON spelling and metadata matches the API exactly |
| Process/source cleanup | All 13 offline groups, 25 observed cursors and two documents close |
| Network/page execution | Zero requests; no SDK or script execution |

The isolated candidate uses clean committed baseline
`6ee8875ce5d30048074668fb182d1bd04a3bc9e7` plus only owned overlays, including
canonical index/manifest additions rather than dirty working copies. Its 1,624
source and 2,408 compiled pins are checked. The canonical native manifest now
has 1,016 entries; 22 pre-existing paths remain absent from the committed tree.
This selected gate is not a new full-suite run or dynamic website acceptance.

Independent review found that the first binding validator admitted reserved
names. A preserved pre-fix run passes 848 tests and fails the 48 new name
regressions. The fix rejects reserved and conservatively context-restricted
names; exact-case ordinary names and keyword-prefixed names remain supported.
Final CLI cases also reject restricted names before reading input.

The earlier 844/0 run and its three test-lint failures remain recorded. Its
format check also included the already nonconforming baseline manifest; the
final format gate is explicitly scoped to the five TypeScript files, without
reformatting unrelated manifest content. An initial aggregate verifier read the
wrong source-hash field; the corrected verifier uses `source.bytes.sha256` and
checks all existing successful CLI artifacts. No CLI or website request was
repeated to correct that reporting error.

## Remaining limitations

This operation does not implement JavaScript execution, runtime state, a general
JavaScript parser, login, rendering or CAPTCHA handling. It retains bounded
lexical HTML/JSON semantics and inherited RCDATA limits. Source values are not
automatically safe or verified facts; authorized callers must select only the
needed public fields. No general speedup or fresh live-site result is claimed.

Historical 100-page results stay **33 useful / 67 other**. This is a separate
recovery from one complete saved source, not a corpus rerun. Continue actionable
website content failures, actual SafeJS/guarded-adapter integration, broader
performance/access testing, real credentials/passkeys/devices and research.
The overall browser objective remains active.

Private evidence:
`node_modules/.cache/native-validation/source-json-binding-september17/`.
