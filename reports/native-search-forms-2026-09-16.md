# Native public search forms — September 16, 2026

## Outcome

Two fresh native form workflows submit successfully. Wikipedia returns useful
search listings; Python documentation returns a JavaScript-only search shell.
The third workflow, arXiv, times out on its initial page before any live form
action. **Two completed submissions are not two successful content searches.**

This adds18 synthetic parsed-form/session regressions and the API guide
`NATIVE-SEARCH-FORMS.md`. No native production defect was established and no
production behavior is changed. The tests protect the demonstrated form path;
they do not implement the missing site scripts or conceal the timeout.

## Every fresh workflow

The native API harness runs the clean `5c3fbb360b65d6a9771066a4c964af638d4ca4c1`
runtime. It uses `BrowserSession`, the full inert native HTML parser for source
controls, native `fillAsync` and `requestSubmit`, and the semantic reader for
destination content. It does not navigate to a manually constructed destination
instead of submitting: the expected URL is checked at the transport boundary.

| Site | Source URL | Submitted destination | Result | Markdown bytes |
| --- | --- | --- | --- | ---: |
| Wikipedia | https://en.wikipedia.org/wiki/Main_Page | https://en.wikipedia.org/w/index.php?search=HTML+parsing+tokenizer&title=Special%3ASearch | Two200 responses; useful search listings | 10094 |
| Python docs | https://docs.python.org/3/library/asyncio-task.html | https://docs.python.org/3/search.html?q=asyncio+timeout | Two200 responses; script-dependent search shell | 148 |
| arXiv | https://arxiv.org/search/?query=language+model+inference&searchtype=all&source=header | Not submitted | Initial native network timeout | 0 |

**Three workflows, five HTTPS GET starts, four complete captured responses,
zero retries or followed redirects.** All five request/socket pairs and all three
process groups close. Native cleanup-error counters are zero, with closed
session/network/route/cookie/storage/storage-event metrics. The arXiv workflow
exits1 after15.183 seconds, not an outer supervisor timeout or forced kill.
Its timeout cause is unproven; do not label it a CAPTCHA or crawler block.

Wikipedia/Python record focus, focusin, beforeinput, input and submit events,
native document replacement, and exact serialized GET destinations. No submitter
is supplied, so unnamed/default buttons are not synthesized into the query.
Public terms are constants; no credential or account form is accessed.

An independent reviewer reads both complete Markdown files and each result,
execution and HTTP-event record. Wikipedia contains20 main result entries with
links and snippets; its authored summary says “Results 1 – 20 of 68”. That total,
relevance and snippet facts are not independently verified. Python's entire
five-line output is a Search heading, JavaScript activation notice and matching
instruction, with no result links or snippets. arXiv has no committed source
document, fill, submit, destination request or Markdown.

Content judgments remain separate from native `passed`/`contentSuccess:null`.
The reviewer independently hashes Markdown; the main audit separately decodes
and hashes all four retained raw response bodies. No article navigation,
full-result completeness, rendered UI, actual CLI or page-runtime acceptance is
claimed. Native API activity is not a real TTY/browser-UI test.

## Source selection and retained failures

The initial arXiv abstract-page fixture contains its only search form inside
`#arxiv-search-overlay` with an authored `hidden` attribute. Native fill correctly
refuses it without sending a second request. That failure remains recorded.
No hidden attribute is removed and no script toggle is emulated.

A separate previously captured public search-results page has a nonhidden main
form with action `/search/`. The revised isolated workflow fills its query with
`transformer inference` and serializes existing select/radio/hidden defaults to:

`https://arxiv.org/search/?query=transformer+inference&searchtype=all&abstracts=show&order=-announced_date_first&size=50`

That destination is proved with a synthetic offline response, **not requested
live**: the fresh initial search-results navigation times out. The old receipt
redacts its query, so its exact source request is independently bound to the
retained historical `FOLLOWUP-CORPUS.json`; no query is guessed from a receipt.
This distinct source-page workflow does not validate the abstract header overlay.

Initial Wikipedia and Python saved-source workflows pass. Final isolated checks
pass for all three chosen forms, using historical source HTML and clearly labeled
synthetic destinations. Those checks prove form serialization/API lifecycle,
not live search content, original response headers or original wire behavior.

## Tests and live safeguards

- Clean baseline:169 passing tests across6 explicit native-manifest files.
- Final:187 passing/0 failing across7 files, including18 new cases; production
  build, selected typecheck, focused formatting and lint pass. No full-manifest
  or actual SafeJS gate is claimed.
- New cases cover default/relative GET actions, query escaping/order, hidden
  defaults, selects/radios, explicit submitter inclusion, awaited submit listeners,
  cancellation/invalid controls, inert scripts, hidden/inert/disabled fill refusal,
  replacement/closure, and native cleanup-error reporting.
- The initial new-test candidate has one failed event assertion plus type/lint/
  formatting failures: the controlled-listener callback used its target argument
  as the event. Corrected the test signature/type import/formatting, not production.
  The intermediate run passes186 tests before the cleanup case is added. All
  original results remain archived.
-39 final isolated policy cases verify exact requests, incomplete/duplicate/stale
  proof rejection, missing kernel denial, cleanup failure, and unapproved direct
  live-entry refusal. They are harness checks, not additional native unit tests.
- Review-driven hardening binds complete offline coverage and runtime/preload
  hashes, atomically consumes each live attempt, checks exact public headers,
  preserves workflow/cleanup failures, and separately validates safety closure.
  A null-prototype header-record assumption initially rejects all three fixtures;
  checking exact own names/values fixes the harness without broadening headers.
- Native session cleanup catches internal exceptions and exposes a counter.
  Child, parent and offline admission now require that counter to be zero and all
  subsystem closed flags to be true. A synthetic regression preserves that
  observable contract; production cleanup semantics remain unchanged.

The final scope keeps2MB response caps,15-second network deadlines,60-second
supervisor deadlines,256MiB heaps,2000ms pacing and exact two-phase HTTPS GET
admission. Redirects fail before following. Native public-network rules and
`AgentBrowser/0.1` identity remain unchanged. No fingerprint spoofing, solver,
credentials, page scripts, SafeJS, external styles/images, other browser/client,
form-action rewrite or automatic retry. Diagnostic HTTP observation is not itself
the pre-dispatch gate; the native request wrapper supplies that restriction.

## Evidence and remaining work

Local lane: `node_modules/.cache/native-validation/native-search-forms-september16`.
The JSON pins source/test/helper inputs, complete response bodies, content review,
all retained failures, final approvals and20 completed proof/live process groups.
Seventeen of those groups are isolated offline fixtures/policy checks; three are
live. Separate native-test subprocesses are not counted as website workflows.

The original100-entry corpus and all historical verdicts remain unchanged; this
is not another100-site sweep. Python's dynamic search, arXiv live form completion
and timeout diagnosis, page scripts/SafeJS, challenge handoff, real UI and
credential/passkey acceptance remain open. The overall browser goal stays active.
Pre-existing work is preserved and no push is performed.
