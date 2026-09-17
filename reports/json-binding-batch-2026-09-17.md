# One-pass source fields and fresh native website workflows

## Implemented result

Agents can now request multiple values from one captured inline JSON binding
with `selectHtmlJsonBindingSources` or the offline CLI's explicit
`--json-pointers` array. One HTML scan and one strict whole-literal JSON pass
replace repeated independent selections. The old single-value API, limits and
default CLI operation remain unchanged.

The batch accepts 1..32 unique ordered pointers, snapshots data indices without
invoking getters/iterators, and rejects missing fields atomically. The sum of
all selected UTF-8 JSON source strings must fit the existing65,536-byte output
cap, including overlapping selections. No source/script/parser cap or runtime
dependency is added. Values remain exact source spellings, unrendered and
unverified; trailing JavaScript is not executed or interpreted.

See `HTML-JSON-BINDING-SOURCE.md` for the API, source coordinates, CLI example,
mutually exclusive pointer flags and source-only limitations.

## Fresh Business Insider workflow

One native anonymous GET of `https://www.businessinsider.com/` returns HTTP200
at **September 17, 2026, 15:17:34.338 UTC**. The complete591,972-byte body has
SHA256 `4bcc2b62877bde8a1b1a308b8916a821ac7f5f357e49568f9f71fb76b568f2a8`;
receipt SHA256 is
`6cd43afca0a2c1f8f7a07149cc6ea02fb29f264560cd4c244933b16b03398fa5`.
No classified barrier, scripts, SDK, credentials, redirects or retries occur.

The ordinary reader produces23,704 Markdown bytes but none of the four complete
news descriptions in the initial `fenrirClientData` literal. Explicit source
selection recovers all **four titles, four descriptions and four publisher
URLs**, paired by their source record index. All twelve values agree with
separately decoded JSON in that same source span. The literal is61,250 UTF-16
units; this is a new capture, not a replay presented as another live visit.

The candidate's twelve individual selections match the committed baseline's
exact selected text and metadata. The batch preserves those value strings and
relative JSON spans while sharing the source metadata. One actual compiled
batch CLI child matches the API's entire values array and metadata.

These are source-delivered summaries from the recorded response, not complete
articles, rendered state, verified publisher claims or a guarantee of current
headlines after that timestamp. No article destination is fetched.

## Scoped speed and output measurements

The comparison uses the exact same fresh body, same twelve pointers and same
candidate runtime. After two warmup pairs, nine pairs alternate single/batch
order. Each timed result is checked outside its timing interval. The measured
operation is twelve sequential single-value API calls versus one batch API call.

| Local instrumented API measurement | Median |
| --- | ---: |
| Twelve independent selections | 263.853 ms |
| One twelve-value batch | 22.041 ms |
| Ratio | 11.97x |

Reported HTML work also falls from70,838,340 summed work units to5,903,195;
those counters measure HTML scanning, not all CPU work. All exact per-pair
timings and counters remain in the JSON evidence. This is one guarded local
source-reading experiment, not a general browser/network speedup, controlled
cross-machine benchmark or SDK/page-execution result.

The twelve baseline single CLI invocations run **in-process** with real bounded
streams and emit21,215 total JSONL envelope bytes. The actual compiled batch CLI
emits7,056 bytes for the same fields: **14,159 fewer bytes, or66.7% smaller**.
The shared provenance reduces repetition without discarding field text. These
are serialized output bytes, not model tokens or saved HTTP requests; both
offline forms make zero requests. Process-startup time is not included in the
API timing comparison.

## Additional fresh destinations

Two further exact destinations are linked from previously captured, complete
non-barrier source pages. The qualified native parser confirms active
same-origin anchors before acquisition; the source pages are not fetched again.

| Destination | Received UTC, September17 | HTML bytes | Full reader Markdown bytes |
| --- | --- | ---: | ---: |
| Rust `std::task::Waker` reference | 15:32:13.946 | 49,145 | 31,591 |
| Engineer Fix transformer-applications article | 15:32:19.495 | 155,307 | 10,653 |

Both exact destinations return HTTP200 with no classified barrier, one native
GET each, no redirects/retries and no scripts or credentials. Subsequent offline
native extraction checks content against complete paragraphs from the captured
HTML, not merely a successful response or nonempty output.

| Executed compact workflow | Markdown bytes | Complete source paragraphs matched |
| --- | ---: | ---: |
| Rust declaration, overview, `wake` and `wake_by_ref` | 3,927 | 12/12 |
| Engineer Fix computers, sound equipment and electrical distribution | 1,008 | 5/5 |

Each workflow fits the fixed 12,288-byte aggregate Markdown limit. All seventeen
paragraphs match both extracted JSON text and normalized Markdown. Normalization
removes link destinations, code padding, Markdown escapes and formatting, not
words or numeric qualifications. Rust's declaration and both method signatures
also match. These are seven API selections in both JSON and Markdown formats,
not seven further live visits or a new compiled replay-CLI test.

Independent review confirms the complete declaration, receivers in both method
signatures, all three application headings, and exactly-once paragraph order.
It also identifies that the v3 automated signature assertions use only prefixes
and do not explicitly check the application headings. A separate artifact-only
verifier closes that coverage gap against the existing outputs: three complete
declaration/signature checks, three exact application-heading checks and all
seventeen complete Markdown paragraph blocks pass. No replay is reexecuted.
The bare application Markdown excerpts omit article title/source attribution;
keep their JSONL companions, which retain the title, URL and source pins.

The first attempt finds an actual targeting mismatch: source `details` and
`summary` elements become inert `div` wrappers in the reader and lose their
classes. Raw-source selectors therefore do not always select the reader tree.
The second attempt reaches the correct Rust method subtree but rejects a raw
Markdown signature substring because the method name is a link. Both failed
attempts and their outputs remain preserved; no production behavior or safety
policy is weakened to make them pass. The final attempt uses source-verified
reader selectors and checks the complete signature in JSON and normalized
Markdown. All 16 documents in the successful invocation close; the earlier
attempts close their four and seven documents too. All three invocations make
zero requests under kernel and JavaScript network denial.

The Rust overview reader selector is `#main-content > div > div.docblock`.
The two method subtrees use
`#implementations-list div:has(> div > section[id="method.wake"])` and its
`method.wake_by_ref` equivalent. Engineer Fix uses heading sections rooted at
`article#post-7244 div.entry-content > h3:nth-of-type(N)` for N=1,8,11. These
selectors are tied to the recorded source, not a guarantee about future markup.
The native reader remains independent of page JavaScript. Publisher claims are
attributed source content, not independently verified technical advice.

## Qualification and boundaries

The final isolated gate passes **1,018 tests across nine selected native files**,
including111 new batch cases. Build, selected test types, and five-TypeScript-file
format/lint pass. The first1,018/0 run is retained with two test-lint findings;
the corrected final run is separate. Independent read-only review identifies no
additional actionable issue within its stated scope.

The candidate is clean committed baseline
`cfba7066fbc2c6b27a00909e5bbd9a4aaedc3d39` plus owned overlays, with1,626 source
and2,408 compiled pins. Canonical index/manifest additions exclude pre-existing
dirty changes. The1,018-entry native manifest still has22 missing committed
paths; this is not a full-manifest or new full-suite run.

The three fresh navigations use the separately pinned pre-batch runtime whose
source matches that committed baseline. Each has its own isolated synthetic
proof and bounded live invocation. Source-field baseline, candidate benchmark
and actual batch CLI checks run under kernel/JavaScript network denial; their
three groups and183 observed source cursors close. Reference-content replay is
separate from these field-performance measurements.

No CAPTCHA bypass, fingerprint equivalence, actual SafeJS integration, real
credential/passkey/device support or universal source recovery is established.
Historical100-page content outcomes remain33 useful/67 other, not rewritten as
a new corpus run. Continue diverse website functionality, access/performance
work, actual runtime integration and unfinished research. The full browser
objective remains active.

Private evidence: `node_modules/.cache/native-validation/json-binding-batch-september17/`,
`node_modules/.cache/native-validation/json-binding-live-september17/`, and
`node_modules/.cache/native-validation/source-reference-live-september17/`.
