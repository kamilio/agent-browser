# Netlib documentation native flow — September 12, 2026

## Actual outcome

**The bounded native documentation-link flow passed.** HTTP 200 or a document commit alone is not working-site acceptance.

- Child UTC: 2026-09-12T08:42:03.271Z through 2026-09-12T08:42:04.137Z.
- Supervisor UTC: 2026-09-12T08:42:03.153Z through 2026-09-12T08:42:04.147Z; 994 ms; exit 0; timeout false; process group absent true.
- First failure: null.
- Counts: 1 initial navigation, 1 genuine click, 2 actual document commits, 4 native transport requests, 4 wire GETs, 4 adapter request-start observations, 4 adapter entries, 0 rejected adapter entries, 0 mocks.
- Initial state/title/history: {"url":"https://www.netlib.org/","title":"The Netlib","root":"e1","nodeCount":163,"revision":164,"sameDocument":true,"observedColorScheme":{"at":"2026-09-12T08:42:03.637Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/","root":"e1","revision":164,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h1-1","url":"https://www.netlib.org/","state":null,"index":0,"length":1},"sessionHistory":{"index":0,"length":1,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":true,"requiresResubmission":false}],"retainedBytes":31,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":2}.
- Discovery: 21 anchors inspected, availability before deduplication; 2 eligible occurrences and 1 unique destinations; selected {"index":15,"reference":"e133","href":"misc/faq.html","url":"https://www.netlib.org/misc/faq.html","text":"Frequently Asked Questions about Netlib (FAQ)","browsingTarget":"_self","availability":{"source":"native styles.get and interactions.actionability before URL deduplication","displayed":true,"visible":true,"blocked":null,"ariaDisabled":false,"ancestorDepth":6,"ancestorComplete":true},"urlQualifies":true,"eligible":true,"eligibleOccurrences":2}.
- After click/failure: {"url":"https://www.netlib.org/misc/faq.html","title":"Netlib FAQ","root":"e164","nodeCount":751,"revision":759,"sameDocument":false,"observedColorScheme":{"at":"2026-09-12T08:42:04.132Z","reason":"before-or-after-click-state","url":"https://www.netlib.org/misc/faq.html","root":"e164","revision":759,"source":"page.styles.metrics().colorScheme","colorScheme":{"preference":null,"effective":"light","profile":"native-ua-color-preference","systemIntegration":false,"siteOverrides":false},"sessionPreferenceSource":"session.colorSchemePreference(tabId)","sessionPreference":null},"history":{"key":"h2-1","url":"https://www.netlib.org/misc/faq.html","state":null,"index":0,"length":1},"sessionHistory":{"index":1,"length":2,"entries":[{"key":"h1-1","url":"https://www.netlib.org/","active":false,"requiresResubmission":false},{"key":"h2-1","url":"https://www.netlib.org/misc/faq.html","active":true,"requiresResubmission":false}],"retainedBytes":75,"evictedDocuments":0},"scroll":{"x":0,"y":0,"maximum":{"x":0,"y":0},"revision":-1,"builds":0,"updates":0,"work":0,"closed":false},"scrollObservation":"existing native metrics only; no geometry refresh or direct scrolling","nativeRequestAttempts":4}.
- Destination observation: {"url":"https://www.netlib.org/misc/faq.html","title":"Netlib FAQ","bodyText":"Frequently Asked Questions (FAQ)\n\n\n\n\n\n\nTable of Contents\n\n\n\nGeneral\n   \n      1.1  What is this FAQ for?\n      1.2  Where can I get a copy of this FAQ?\n      1.3  Where should I send comments and corrections for this FAQ?\n      1.4  What is the Netlib Question and Answer Forum? \n   \n\n\nNetlib\n   \n     2.1)  What is Netlib?\n     2.2)  How do I retrieve software or documents from Netlib?\n     2.3)  Are there restrictions on the use of software retrieved from Netlib?\n     2.4)  How do I submit software or documents to Netlib?\t\n     2.5)  Where are the Netlib mirror sites?\n     2.6)  Which sites use the Netlib email server to distribute other\n\t\ttypes of software?\n     2.7)  Where can I find more information about Netlib?\n     2.8)  What is Xnetlib?\n     2.9)  How do I find a particular routine?\n     2.10)  How do I find software to solve a particular problem?\n     2.11) I can't get a program to work.  What should I do?\n     2.12) Where can I find documentation for a particular program?\n     2.13) What is dependency checking and how does it work?\n     2.14) I requested some software but didn't get all the routines\n\t\tI needed.  Why?\n     2.15) What and where are the BLAS?\n     2.16) Why don't I get needed BLAS automatically when I select \n\t\tLAPACK routines?\n     2.17) What and where are r1mach, d1mach, and i1mach?\n     2.18) How can I unpack foo.tar.z?\n     2.19) How can I unpack foo.tgz?\n     2.20) Does Netlib offer technical support?\n     2.21) Can I download all/lots of the Netlib repository?\n     2.22) How can I become a Netlib site?\n     2.23) How can I use the Netlib program to run my own repository?\n     2.24) What if I have other questions about Netlib?\n   \n\n\n\n\n\n1)  General\n\n\n\n\n\n    1.1)  What is this FAQ for?\n\n\n\nTo provide basic introductory information and answers to frequently\nasked questions about Netlib.\n\n\n\n\n\n    1.2)  Where can I get a copy of this FAQ?\n\n\n\nThe most recent version of this FAQ can be retrieved from\n\n\t\n\thttp://www.netlib.org/misc/faq.html\n\nor\n\n    \n\tftp://ftp.netlib.org/misc/faq\n\n\n\n\n\n\n    1.3)  Where should I send comments and corrections for this FAQ?\n\n\n\nSend email to \nnetlib_maintainers@netlib.org\n\n\n\n\n\n   1.4)  What is the Netlib Question and Answer Forum?\n\n\n\nNetlib Question and Answer Forum is bulletin board moderated\nby Netlib group. Feel free to post, answer, and discuss questions\nof other people.\n\n\n\n\n2)  Netlib\n\n\n\n\n\n\n    2.1) What is Netlib?  \n\n\n\nThe Netlib repository contains freely available software, documents,\nand databases of interest to the numerical, scientific computing, and\nother communities. The repository is maintained by AT&T Bell\nLaboratories, the University of Tennessee and Oak Ridge National\nLaboratory, and by colleagues world-wide.  The collection is\nreplicated at several sites around the world, automatically\nsynchronized, to provide reliable and network efficient service to the\nglobal community.\n\n\n\n\n\n    2.2)  How do I retrieve software or documents from Netlib?\n\n\n\n\n\n\nWorld Wide Web (WWW)\n\n\nhttp://www.netlib.org/\n\n\n\n\n\n\n\n\n\n\n\n    2.3)  Are there restrictions on the use of software\n          retrieved from Netlib?\n\n\n\nMost netlib software packages have no restrictions on their use but we\nrecommend you check with the authors to be sure.  Checking with the\nauthors is a nice courtesy anyway since many authors like to know how\ntheir codes are being used.\n\n\n\n\n    2.4)  How do I submit software or documents to Netlib?\t\n\n\n\nDirect inquiries to \nnetlib_maintainers@netlib.org\n\n\n\n\n\n    2.5)  Where are the official Netlib mirror sites?\n\n\n\nSee\n\n\nhttp://www.netlib.org/bib/mirrors.html\n\nfor the list of official Netlib mirror sites.\n\n\n\n\n    2.6)  Which sites use the Netlib email server to distribute other\n\t\ttypes of software?\n\n\n\nA collection of statistical software is available from\n\nstatlib@temper.stat.cmu.edu\n\n\nThe TeX User Group distributes TeX-related software from\n\ntuglib@math.utah.edu\n\n\nThe symbolic algebra system REDUCE is supported by\n\nreduce-netlib@rand.org\n\n\nParallel software and information about parallel processing\nis available from\n\nparlib@hubcap.clemson.edu\n\n\nDozens of other specialized sites also use the processor which \ncan be found in\n\n/netlib/misc/netlib.\n\n\n\n\n    2.7)  Where can I find more information about Netlib?\n\n\n\nA collection of working notes related to the Netlib repository\nis available at :\n\n\nhttp://www.netlib.org/srwn/\n\n\n\n\n\n\n    2.8)  What is Xnetlib?\n\n\n\nXnetlib is an X Window System application that provides interactive\nfile access and database query processing from multiple servers\nthrough TCP/IP connections. Xnetlib currently provides access to the\n\nNetlib software and document repository, and the\n\nNA-NET Whitepages Database.\n\nThe last release of Xnetlib was version 1.3.  Since its release, most\nof its capabilities have been superceded by World Wide Web browsers\nlike\n\nMosiac or\n\nNetscape.\nSince most of the efforts at Netlib are presently geared more towards\nthe World Wide Web, we recommend using a WWW browser.\n\n\n\n\n\n\n    2.9)  How do I find a particular routine?\n\n\n\nThe most powerful search capabilities in Netlib are provided through the\ninterface at\n\n\t\n\thttp://www.netlib.org/utk/misc/netlib_query.html\n\nOne way to search for a particular routine, say \"foo\", would be to submit\nthe search query \"file=foo\".\n\nThe Netlib email interface has a similar capability.  Send the email message\n\"find foo\" to netlib@netlib.org or another Netlib site.\n\n\n\n\n\n    2.10)  How do I find software to solve a particular problem?\n\n\n\nOne way is to identify appropriate keywords and then use the Web search\ninterface at\n\n\nhttp://www.netlib.org/utk/misc/netlib_query.html\n\nor the \"find\" feature of the Netlib email interface and send the email message\nto netlib@netlib.org or another Netlib site.\n\nThe GAMS mathematical software classification system enables users to\nfind suitable software by browsing the problem hierarchy.  You can use\nGAMS from the search interface or by linking to\n\n\nhttp://www.netlib.org/bib/gams.html\n\nor\n\n\nhttp://gams.nist.gov/\n\nSend the message \"send gams from bib\" to netlib@netlib.org to\nretrieve the GAMS classification by email.\n\nAnother way is to browse the Netlib libraries list and to identify libraries\nappropriate to your problem.  You can then browse the contents of these\nindividual libraries.  Using a Web interface, look at\n\n\nhttp://www.netlib.org/liblist.html\n\nUsing an email interface, send the message \"send index\" to netlib@netlib.org\nor another Netlib site to receive a descriptive list of the libraries in\nNetlib.  Send the message \"send index for foo\" to receive the index for\nlibrary foo.\n\n\n\n\n\n\n    2.11) I can't get a program to work.  What should I do?\n\n\n\nTechnical questions about the proper use of a software package should\nbe directed to the authors of that package.\n\n\n\n\n\n    2.12) Where can I find documentation for a particular program?\n\n\n\nDocumentation for a particular software package generally comes with\nthe software bundle or resides in the same directory as the software.\nNote that much of the software in Netlib is self-documenting - the\ncomments in the code provide all the documentation you need.\n\n\n\n\n\n    2.13) What is dependency checking and how does it work?\n\n\n\nDependency checking is Netlib's mechanism for sending routines called\nby those routines a user has explicitly selected.  A single request\nfor the highest level routine should therefore get all the routines a\nuser needs.\n\nDependencies are generated from a script that looks at the load\nmap for each software package.  A manually edited file tells Netlib\nwhich directories to scan for dependent routines.\n\n\n\n\n\n    2.14) I requested some software but didn't get all the routines\n\t\tI needed.  Why?\n\n\n\nSend email to\n\nnetlib_maintainers@netlib.org describing the behavior.\n\n\n\n\n\n\n    2.15) What and where are the BLAS?\n\n\n\nThe BLAS (Basic Linear Algebra Subprograms) are high quality\n\"building block\" routines for performing basic vector and matrix\noperations.  Level 1 BLAS do vector-vector operations, Level 2\nBLAS do matrix-vector operations, and Level 3 BLAS do\nmatrix-matrix operations.  Because the BLAS are efficient,\nportable, and widely available, they're commonly used in the\ndevelopment of high quality linear algebra software,\nLINPACK and\nLAPACK for example.  \n\nThe BLAS are located in the\nblas directory of Netlib.\n\n\n\n\n\n    2.16) Why don't I get needed BLAS automatically when I select\n\t\n\t\tLAPACK routines?\n\n\n\nLAPACK is designed especially for high-performance computing so the\nLAPACK group prefers that users use tuned vendor-supplied BLAS\nwhenever possible.\n\n\n\n\n\n    2.17) What and where are\nr1mach,\nd1mach, and\ni1mach?\n\n\n\nThese routines are used to specify machine-dependent parameters such\nas your machine's precision.  They're used by several packages, most\ncommonly to ensure that tolerances used in the software is reasonable\nfor a particular machine.  \n\nThe easiest to use versions of the routines r1mach, d1mach, and i1mach \nare located in the\nblas directory\nof Netlib.  These versions of r1mach\nand d1mach attempt to determine machine characteristics automatically.\n\nThe original versions of r1mach, d1mach, and i1mach, in the\nslatec/src\ndirectory, require a user to scan their source and to uncomment the\nstatements specifying the constants for his particular machine.\nConstants for some architectures are not explicitly identified in the\ncomments of r1mach, d1mach, and i1mach.  For those architectures\nconforming to the IEEE floating-point standard, and most newer ones\ndo, you can locate and uncomment the IEEE-conforming constants in the\nroutines.\n\n\n\n\n\n\n    2.18) How can I unpack foo.tar.z?\n\n\n\n   mv foo.tar.z foo.tar.Z\n   uncompress foo.tar.Z\n   tar xvf foo.tar\n\n\n\n\n\n\n    2.19) How can I unpack foo.tgz?\n\n\n\n   gunzip foo.tgz\n   tar xvf foo.tar\n\nFor Windows and Mac, commercial tools are available\nfrom www.winzip.com\nand www.stuffit.com.\n\n\n\n\n\n    2.20) Does Netlib offer technical support?\n\n\n\nNo.  Technical questions should be directed to the authors of the\nsoftware package.\n\n\n\n\n\n    2.21) Can I download all/lots of the Netlib repository?\n\n\n\nYes.  Note however that downloading software that isn't going to be\nused right away tends to waste time and space.  When you're finally\nready to use it, you may end up downloading it again from Netlib just\nto be sure you have the latest version.  For this same reason,\ndownloading all of Netlib's software and storing it someplace is not\nthe best way to build a local software repository.\n\n\n\n\n\n    2.22) How can I become a Netlib mirror site?\n\n\n\nFirst check the list of mirror sites (Question 2.5)\nto see if an existing Netlib site could meet your needs. \nThen read the policy on becoming a Netlib mirror site at\n\n\nhttp://www.netlib.org/bib/mirrors.html.\n\nDirect inquiries to\n\n\nmaintainers.\n\n\nSee the contents of the directory\n\n/netlib/crc for technical information on mirroring.\n\n\n\n\n\n    2.23) How can I use the Netlib program to run my own repository?\n\n\n\nYou can retrieve the source code for the Netlib email system from the\n\"netlib\"\ndirectory of the Netlib repository.  For example, to retrieve\nthe Netlib program by email send the message\n   send netlib from netlib\n\nto netlib@netlib.org.\n\n\n\n\n    2.24) What if I have other questions about Netlib?\n\n\n\nThe srwn directory contains papers that may be of assistance.\nPoint your Web browser to\n\n\nhttp://www.netlib.org/srwn/\n\nSend your questions to\n\n\nnetlib_maintainers at netlib.org","bodyTextCodeUnits":11352,"status":200,"headers":{"server":["nginx/1.29.0"],"date":["Sat, 12 Sep 2026 08:42:03 GMT"],"content-type":["text/html; charset=UTF-8"],"content-length":["17421"],"connection":["close"],"last-modified":["Fri, 14 Jun 2024 10:24:50 GMT"],"etag":["\"440d-61ad7068e6843\""],"accept-ranges":["bytes"],"strict-transport-security":["max-age=31536000"]},"differentDocument":true,"oldDocumentRemainingNodes":0,"requestedUrl":"https://www.netlib.org/misc/faq.html","actualRedirects":[],"nodes":751}.
- No retries, forced navigation, invented links, source suppression, identity changes, bypass or alternate client.

## Contract and release

One new session: initial https://www.netlib.org/ and at most one actual available discovered same-origin HTML documentation anchor click. Original HTML/CSS are intact. Only original native document/CSS/image requests are allowed; optional cross-origin images may be denied locally, never fetched elsewhere.

Predeclared ceilings: 32 bodyless GETs, 250ms monotonic per-origin deadline rechecks, 8MiB encoded/decoded session transfer, 2MiB encoded/decoded response, 45s wall plus 5s kill grace. Native network/session/DOM/layout capacities otherwise unchanged. File and aggregate child output cap 6MiB; lane 16MiB; minimum free space 64MiB. These remain fixed ceilings, not goals.

Pinned runtime: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-gif-image-september12-round00/snapshot01/dist`; commit `e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3`; Node22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (SHA256 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31). Working code was not executed; only the released GIF image snapshot was used.

Reverified 20 gate receipts, 1132 source files, 1952 compiled files, and 12 commit-owned inputs. Historical gate: 12470 passed, 0 failed, 2 unchanged exclusions; 240 selected suites, 239 strict roots, 634 manifest entries. No rebuild or full-suite rerun.

Exact parent Git command stdout/stderr and invocation records prove each commit input. Offline verification compares those original buffers, the pinned snapshot and hashes, without spawning Git or weakening unconditional kernel socket/socketpair denial.

- source SHA256: `3b212e3dcaf2ff048cc0fb15a08395086be338d399ac7be9ddb24907a449add1`.
- compiled SHA256: `e17e8efa3f522ad7c4d9aef4f24e22366fb4cca6f44ae868c53ed72613dcd744`.
- nativeResults SHA256: `7155438d09b235f026f5a10fc84614700559c9a30f54057bf564df52e0735b97`.
- summary SHA256: `37b39dcf9d1f29192cb295b8ec3ba4bea7697765bdea179ba747619633e8c01f`.
- audit SHA256: `09db366205e8947b7be4ff53fee288df86c75463c37ac5b97b5fcacbdc583db0`.
- receipts SHA256: `9eacc4ddfde4dea6d35069cbd2ab2cbc7d1f87602eefddcbe9761ac269f14dd5`.
- commitVerification SHA256: `9da545f8a3beee47841df3036ffba0f6f9a861630caacfd268100827758a887e`.

Both the historical 12037 and center12350 Netlib flows remain failed and untouched, not new baselines. The completed native-netlib-center-flow-september12 harness/checker supplies the adapted implementation, not a new historical run. All four original seals (140/142/146/148 receipts) and their members are verified before/after this run and during read-only verification. 30 selected helper/report/task/release buffers are archived byte-for-byte; the entire old lane is not duplicated. No old probes execute.

## Preserved preparation and offline checks

Preparation and failed checks belong to this lane only; any failures are preserved and enumerated below. Historical failures are not attributed to this new session. Repeated Netlib adds no host to the unchanged 75-attempt inventory. GIF decoding does not prove navigation acceptance or resolution of independent formatting profiles. Initial GIF-frame presentation is not animation playback, browser parity or broader site acceptance. The checker normalizes ordered raw headers offline with IncomingMessage._addHeaderLines while retaining distinct native raw values. No socket self-probes or refetch.

The candidate filter conservatively requires an actual .htm/.html path and guide/FAQ/about/help/manual/documentation wording. Directory and extensionless anchors are not substitutes; destination text/html MIME is checked if reached.

Working HEAD observations: before e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3; after e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3. These are independent of the pinned runtime commit. Git status snapshots retain path metadata only; protected payloads and credentials were not read. Concurrent external edits are not attributed to this lane.

## Exact response artifacts

| Wire ID | URL | Kind | HTTP | Encoded / decoded bytes |
| --- | --- | --- | --- | --- |
| 1 | `https://www.netlib.org/` | document | 200 | 3921 / 3921 |
| 2 | `https://www.netlib.org/netlib2.gif` | image | 200 | 6710 / 6710 |
| 3 | `https://www.netlib.org/misc/faq.html` | document | 200 | 17421 / 17421 |
| 4 | `https://www.netlib.org/netlib2.gif` | image | 200 | 6710 / 6710 |

Native measured totals: 34762 encoded bytes, 34762 decoded bytes. Locally rejected images: 0.

Original encoded response payloads, native decoded response buffers, and ordered Node raw-header arrays have separate exact lengths and SHA256 hashes in the claims. Header records omit credential/cookie fields if present and record the exact number omitted; they are not raw TCP/TLS packet captures. Decompression is independently checked against each native response body.

## Native GIF observations

Loaded GIF dimensions and metadata: [{"phase":"initial","documentUrl":"https://www.netlib.org/","ref":"e23","state":"complete","complete":true,"currentSrc":"https://www.netlib.org/netlib2.gif","naturalWidth":147,"naturalHeight":148,"originClean":true,"ignoredAncillaryChunks":[],"mediaType":"image/gif","ignoredMetadata":[],"gif":{"version":"87a","frameCount":1,"animated":false,"loopCount":null,"durationMs":0,"presentation":"initial-frame","animationPlayback":false},"responseBodySha256":"87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d"},{"phase":"destination","documentUrl":"https://www.netlib.org/misc/faq.html","ref":"e178","state":"complete","complete":true,"currentSrc":"https://www.netlib.org/netlib2.gif","naturalWidth":147,"naturalHeight":148,"originClean":true,"ignoredAncillaryChunks":[],"mediaType":"image/gif","ignoredMetadata":[],"gif":{"version":"87a","frameCount":1,"animated":false,"loopCount":null,"durationMs":0,"presentation":"initial-frame","animationPlayback":false},"responseBodySha256":"87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d"}]. Only the initial frame is presented; no animation playback or navigation acceptance follows from decoding.

## One bounded failure census

No census was needed or available; absent diagnostics are not zero counts.

## Cleanup, security and limitations

Owner cleanup: {"eventOwnersInstrumented":2,"imageOwnersInstrumented":2,"eventOwnerCleanupProved":true,"imageOwnerCleanupProved":true,"documentOwnersInstrumented":2,"controlOwnersInstrumented":2,"documentOwnerCleanupProved":true,"controlOwnerCleanupProved":true,"scope":"Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"}. Immediate/final native session, request queue, transport, document, event, image and control metrics are retained in stdout/progress. Empty owner samples do not prove cleanup.

Native public-address checks and unchanged TLS certificate validation, original AgentBrowser/0.1 identity, credentials omitted, empty cookie jar. Private0700 lane/HOME/TMP, 0600 files, explicit environment, stdin /dev/null, no TTY. Live seccomp blocks listening, tracing, process-vm and io_uring; outbound traffic remains subject to native origin/provenance/public-address/TLS controls. Offline verification additionally denies socket, socketpair, connect, bind, send and receive at the kernel layer; no socket self-probes.

No downloads, PDFs, archives, forms, accounts, providers, credentials, .env/pass reads, devices, real SafeJS, page runtime or CAPTCHA bypass. Stop at HTTP failure, Retry-After, access restrictions, challenges or capacity. This does not establish general browser compatibility or any independent acceptance gate.

Preserved failed preparation/check artifacts: []. All live failures remain failures; no relaunch is authorized.

No source, TASKS, inventory, commit or push changes. Only NETLIB-GIF-FLOW.md and the new private lane are owned. Parent audits and updates shared inventory and overall browser gates. Protected native-source-heading-source-10 payloads were not read.

## Read-only verification

From repository root. The verifier performs no write, network, browser navigation, old probe, Git subprocess, rebuild or suite rerun. Do not redirect its output into the sealed lane.

```sh
LANE="$PWD/node_modules/.cache/native-validation/native-netlib-gif-flow-september12"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$LANE/home" TMPDIR="$LANE/tmp" PYTHONDONTWRITEBYTECODE=1 /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- /usr/bin/setpriv --no-new-privs /usr/bin/python3 -I -B "$LANE/strict-offline-exec.py" /home/kjopek/.nvm/versions/node/v22.22.0/bin/node --import "$LANE/network-guard.mjs" "$LANE/verify-verified.mjs" </dev/null
```

## Exact machine-verifiable claims

```json
{
  "gifImages": [
    {
      "phase": "initial",
      "documentUrl": "https://www.netlib.org/",
      "ref": "e23",
      "state": "complete",
      "complete": true,
      "currentSrc": "https://www.netlib.org/netlib2.gif",
      "naturalWidth": 147,
      "naturalHeight": 148,
      "originClean": true,
      "ignoredAncillaryChunks": [],
      "mediaType": "image/gif",
      "ignoredMetadata": [],
      "gif": {
        "version": "87a",
        "frameCount": 1,
        "animated": false,
        "loopCount": null,
        "durationMs": 0,
        "presentation": "initial-frame",
        "animationPlayback": false
      },
      "responseBodySha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d"
    },
    {
      "phase": "destination",
      "documentUrl": "https://www.netlib.org/misc/faq.html",
      "ref": "e178",
      "state": "complete",
      "complete": true,
      "currentSrc": "https://www.netlib.org/netlib2.gif",
      "naturalWidth": 147,
      "naturalHeight": 148,
      "originClean": true,
      "ignoredAncillaryChunks": [],
      "mediaType": "image/gif",
      "ignoredMetadata": [],
      "gif": {
        "version": "87a",
        "frameCount": 1,
        "animated": false,
        "loopCount": null,
        "durationMs": 0,
        "presentation": "initial-frame",
        "animationPlayback": false
      },
      "responseBodySha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d"
    }
  ],
  "budget": {
    "checks": [
      "original12037AndCenter12350FailuresRemainHistoricalNotRerunBaselines",
      "fixed32GETScopeOtherNativeLimitsUnchanged",
      "wallStorageAndOriginPredeclared",
      "historicalNetlibFlowNotReclassifiedOrExecuted",
      "documentLimitsAndDisabledPageRuntimePreserved",
      "independentAdapterNativeWireAndMockAccounting",
      "responseAndTotalTransferCapsObserved",
      "noWireRequestsAfterGlobalStop",
      "freshSingleNavigationAtMostOneRealClick",
      "discoveredDocumentationOnlyNoDownloadOrForcedNavigation",
      "twelveExplicitCommitInputsAndExactParentGitBuffersReverifiedWithoutIPC",
      "allLaneFilesPrivate"
    ],
    "fixedBeforeLaunch": {
      "maxRequests": 32,
      "maxResponseBytes": 2097152,
      "maxTotalBytes": 8388608
    },
    "historicalReferenceFlowPassed": false,
    "current": {
      "flowPassed": true,
      "wireRequests": 4,
      "adapterEntries": 4,
      "commits": 2,
      "clicks": 1,
      "failure": null,
      "wallMs": 994
    },
    "censusMethod": "One authoritative raw/applicable CSS and non-CSS/deferred census; no substring rule excerpts",
    "newFailedCheckArtifacts": []
  },
  "formattingCensus": null,
  "destination": {
    "url": "https://www.netlib.org/misc/faq.html",
    "title": "Netlib FAQ",
    "bodyText": "Frequently Asked Questions (FAQ)\n\n\n\n\n\n\nTable of Contents\n\n\n\nGeneral\n   \n      1.1  What is this FAQ for?\n      1.2  Where can I get a copy of this FAQ?\n      1.3  Where should I send comments and corrections for this FAQ?\n      1.4  What is the Netlib Question and Answer Forum? \n   \n\n\nNetlib\n   \n     2.1)  What is Netlib?\n     2.2)  How do I retrieve software or documents from Netlib?\n     2.3)  Are there restrictions on the use of software retrieved from Netlib?\n     2.4)  How do I submit software or documents to Netlib?\t\n     2.5)  Where are the Netlib mirror sites?\n     2.6)  Which sites use the Netlib email server to distribute other\n\t\ttypes of software?\n     2.7)  Where can I find more information about Netlib?\n     2.8)  What is Xnetlib?\n     2.9)  How do I find a particular routine?\n     2.10)  How do I find software to solve a particular problem?\n     2.11) I can't get a program to work.  What should I do?\n     2.12) Where can I find documentation for a particular program?\n     2.13) What is dependency checking and how does it work?\n     2.14) I requested some software but didn't get all the routines\n\t\tI needed.  Why?\n     2.15) What and where are the BLAS?\n     2.16) Why don't I get needed BLAS automatically when I select \n\t\tLAPACK routines?\n     2.17) What and where are r1mach, d1mach, and i1mach?\n     2.18) How can I unpack foo.tar.z?\n     2.19) How can I unpack foo.tgz?\n     2.20) Does Netlib offer technical support?\n     2.21) Can I download all/lots of the Netlib repository?\n     2.22) How can I become a Netlib site?\n     2.23) How can I use the Netlib program to run my own repository?\n     2.24) What if I have other questions about Netlib?\n   \n\n\n\n\n\n1)  General\n\n\n\n\n\n    1.1)  What is this FAQ for?\n\n\n\nTo provide basic introductory information and answers to frequently\nasked questions about Netlib.\n\n\n\n\n\n    1.2)  Where can I get a copy of this FAQ?\n\n\n\nThe most recent version of this FAQ can be retrieved from\n\n\t\n\thttp://www.netlib.org/misc/faq.html\n\nor\n\n    \n\tftp://ftp.netlib.org/misc/faq\n\n\n\n\n\n\n    1.3)  Where should I send comments and corrections for this FAQ?\n\n\n\nSend email to \nnetlib_maintainers@netlib.org\n\n\n\n\n\n   1.4)  What is the Netlib Question and Answer Forum?\n\n\n\nNetlib Question and Answer Forum is bulletin board moderated\nby Netlib group. Feel free to post, answer, and discuss questions\nof other people.\n\n\n\n\n2)  Netlib\n\n\n\n\n\n\n    2.1) What is Netlib?  \n\n\n\nThe Netlib repository contains freely available software, documents,\nand databases of interest to the numerical, scientific computing, and\nother communities. The repository is maintained by AT&T Bell\nLaboratories, the University of Tennessee and Oak Ridge National\nLaboratory, and by colleagues world-wide.  The collection is\nreplicated at several sites around the world, automatically\nsynchronized, to provide reliable and network efficient service to the\nglobal community.\n\n\n\n\n\n    2.2)  How do I retrieve software or documents from Netlib?\n\n\n\n\n\n\nWorld Wide Web (WWW)\n\n\nhttp://www.netlib.org/\n\n\n\n\n\n\n\n\n\n\n\n    2.3)  Are there restrictions on the use of software\n          retrieved from Netlib?\n\n\n\nMost netlib software packages have no restrictions on their use but we\nrecommend you check with the authors to be sure.  Checking with the\nauthors is a nice courtesy anyway since many authors like to know how\ntheir codes are being used.\n\n\n\n\n    2.4)  How do I submit software or documents to Netlib?\t\n\n\n\nDirect inquiries to \nnetlib_maintainers@netlib.org\n\n\n\n\n\n    2.5)  Where are the official Netlib mirror sites?\n\n\n\nSee\n\n\nhttp://www.netlib.org/bib/mirrors.html\n\nfor the list of official Netlib mirror sites.\n\n\n\n\n    2.6)  Which sites use the Netlib email server to distribute other\n\t\ttypes of software?\n\n\n\nA collection of statistical software is available from\n\nstatlib@temper.stat.cmu.edu\n\n\nThe TeX User Group distributes TeX-related software from\n\ntuglib@math.utah.edu\n\n\nThe symbolic algebra system REDUCE is supported by\n\nreduce-netlib@rand.org\n\n\nParallel software and information about parallel processing\nis available from\n\nparlib@hubcap.clemson.edu\n\n\nDozens of other specialized sites also use the processor which \ncan be found in\n\n/netlib/misc/netlib.\n\n\n\n\n    2.7)  Where can I find more information about Netlib?\n\n\n\nA collection of working notes related to the Netlib repository\nis available at :\n\n\nhttp://www.netlib.org/srwn/\n\n\n\n\n\n\n    2.8)  What is Xnetlib?\n\n\n\nXnetlib is an X Window System application that provides interactive\nfile access and database query processing from multiple servers\nthrough TCP/IP connections. Xnetlib currently provides access to the\n\nNetlib software and document repository, and the\n\nNA-NET Whitepages Database.\n\nThe last release of Xnetlib was version 1.3.  Since its release, most\nof its capabilities have been superceded by World Wide Web browsers\nlike\n\nMosiac or\n\nNetscape.\nSince most of the efforts at Netlib are presently geared more towards\nthe World Wide Web, we recommend using a WWW browser.\n\n\n\n\n\n\n    2.9)  How do I find a particular routine?\n\n\n\nThe most powerful search capabilities in Netlib are provided through the\ninterface at\n\n\t\n\thttp://www.netlib.org/utk/misc/netlib_query.html\n\nOne way to search for a particular routine, say \"foo\", would be to submit\nthe search query \"file=foo\".\n\nThe Netlib email interface has a similar capability.  Send the email message\n\"find foo\" to netlib@netlib.org or another Netlib site.\n\n\n\n\n\n    2.10)  How do I find software to solve a particular problem?\n\n\n\nOne way is to identify appropriate keywords and then use the Web search\ninterface at\n\n\nhttp://www.netlib.org/utk/misc/netlib_query.html\n\nor the \"find\" feature of the Netlib email interface and send the email message\nto netlib@netlib.org or another Netlib site.\n\nThe GAMS mathematical software classification system enables users to\nfind suitable software by browsing the problem hierarchy.  You can use\nGAMS from the search interface or by linking to\n\n\nhttp://www.netlib.org/bib/gams.html\n\nor\n\n\nhttp://gams.nist.gov/\n\nSend the message \"send gams from bib\" to netlib@netlib.org to\nretrieve the GAMS classification by email.\n\nAnother way is to browse the Netlib libraries list and to identify libraries\nappropriate to your problem.  You can then browse the contents of these\nindividual libraries.  Using a Web interface, look at\n\n\nhttp://www.netlib.org/liblist.html\n\nUsing an email interface, send the message \"send index\" to netlib@netlib.org\nor another Netlib site to receive a descriptive list of the libraries in\nNetlib.  Send the message \"send index for foo\" to receive the index for\nlibrary foo.\n\n\n\n\n\n\n    2.11) I can't get a program to work.  What should I do?\n\n\n\nTechnical questions about the proper use of a software package should\nbe directed to the authors of that package.\n\n\n\n\n\n    2.12) Where can I find documentation for a particular program?\n\n\n\nDocumentation for a particular software package generally comes with\nthe software bundle or resides in the same directory as the software.\nNote that much of the software in Netlib is self-documenting - the\ncomments in the code provide all the documentation you need.\n\n\n\n\n\n    2.13) What is dependency checking and how does it work?\n\n\n\nDependency checking is Netlib's mechanism for sending routines called\nby those routines a user has explicitly selected.  A single request\nfor the highest level routine should therefore get all the routines a\nuser needs.\n\nDependencies are generated from a script that looks at the load\nmap for each software package.  A manually edited file tells Netlib\nwhich directories to scan for dependent routines.\n\n\n\n\n\n    2.14) I requested some software but didn't get all the routines\n\t\tI needed.  Why?\n\n\n\nSend email to\n\nnetlib_maintainers@netlib.org describing the behavior.\n\n\n\n\n\n\n    2.15) What and where are the BLAS?\n\n\n\nThe BLAS (Basic Linear Algebra Subprograms) are high quality\n\"building block\" routines for performing basic vector and matrix\noperations.  Level 1 BLAS do vector-vector operations, Level 2\nBLAS do matrix-vector operations, and Level 3 BLAS do\nmatrix-matrix operations.  Because the BLAS are efficient,\nportable, and widely available, they're commonly used in the\ndevelopment of high quality linear algebra software,\nLINPACK and\nLAPACK for example.  \n\nThe BLAS are located in the\nblas directory of Netlib.\n\n\n\n\n\n    2.16) Why don't I get needed BLAS automatically when I select\n\t\n\t\tLAPACK routines?\n\n\n\nLAPACK is designed especially for high-performance computing so the\nLAPACK group prefers that users use tuned vendor-supplied BLAS\nwhenever possible.\n\n\n\n\n\n    2.17) What and where are\nr1mach,\nd1mach, and\ni1mach?\n\n\n\nThese routines are used to specify machine-dependent parameters such\nas your machine's precision.  They're used by several packages, most\ncommonly to ensure that tolerances used in the software is reasonable\nfor a particular machine.  \n\nThe easiest to use versions of the routines r1mach, d1mach, and i1mach \nare located in the\nblas directory\nof Netlib.  These versions of r1mach\nand d1mach attempt to determine machine characteristics automatically.\n\nThe original versions of r1mach, d1mach, and i1mach, in the\nslatec/src\ndirectory, require a user to scan their source and to uncomment the\nstatements specifying the constants for his particular machine.\nConstants for some architectures are not explicitly identified in the\ncomments of r1mach, d1mach, and i1mach.  For those architectures\nconforming to the IEEE floating-point standard, and most newer ones\ndo, you can locate and uncomment the IEEE-conforming constants in the\nroutines.\n\n\n\n\n\n\n    2.18) How can I unpack foo.tar.z?\n\n\n\n   mv foo.tar.z foo.tar.Z\n   uncompress foo.tar.Z\n   tar xvf foo.tar\n\n\n\n\n\n\n    2.19) How can I unpack foo.tgz?\n\n\n\n   gunzip foo.tgz\n   tar xvf foo.tar\n\nFor Windows and Mac, commercial tools are available\nfrom www.winzip.com\nand www.stuffit.com.\n\n\n\n\n\n    2.20) Does Netlib offer technical support?\n\n\n\nNo.  Technical questions should be directed to the authors of the\nsoftware package.\n\n\n\n\n\n    2.21) Can I download all/lots of the Netlib repository?\n\n\n\nYes.  Note however that downloading software that isn't going to be\nused right away tends to waste time and space.  When you're finally\nready to use it, you may end up downloading it again from Netlib just\nto be sure you have the latest version.  For this same reason,\ndownloading all of Netlib's software and storing it someplace is not\nthe best way to build a local software repository.\n\n\n\n\n\n    2.22) How can I become a Netlib mirror site?\n\n\n\nFirst check the list of mirror sites (Question 2.5)\nto see if an existing Netlib site could meet your needs. \nThen read the policy on becoming a Netlib mirror site at\n\n\nhttp://www.netlib.org/bib/mirrors.html.\n\nDirect inquiries to\n\n\nmaintainers.\n\n\nSee the contents of the directory\n\n/netlib/crc for technical information on mirroring.\n\n\n\n\n\n    2.23) How can I use the Netlib program to run my own repository?\n\n\n\nYou can retrieve the source code for the Netlib email system from the\n\"netlib\"\ndirectory of the Netlib repository.  For example, to retrieve\nthe Netlib program by email send the message\n   send netlib from netlib\n\nto netlib@netlib.org.\n\n\n\n\n    2.24) What if I have other questions about Netlib?\n\n\n\nThe srwn directory contains papers that may be of assistance.\nPoint your Web browser to\n\n\nhttp://www.netlib.org/srwn/\n\nSend your questions to\n\n\nnetlib_maintainers at netlib.org",
    "bodyTextCodeUnits": 11352,
    "status": 200,
    "headers": {
      "server": [
        "nginx/1.29.0"
      ],
      "date": [
        "Sat, 12 Sep 2026 08:42:03 GMT"
      ],
      "content-type": [
        "text/html; charset=UTF-8"
      ],
      "content-length": [
        "17421"
      ],
      "connection": [
        "close"
      ],
      "last-modified": [
        "Fri, 14 Jun 2024 10:24:50 GMT"
      ],
      "etag": [
        "\"440d-61ad7068e6843\""
      ],
      "accept-ranges": [
        "bytes"
      ],
      "strict-transport-security": [
        "max-age=31536000"
      ]
    },
    "differentDocument": true,
    "oldDocumentRemainingNodes": 0,
    "requestedUrl": "https://www.netlib.org/misc/faq.html",
    "actualRedirects": [],
    "nodes": 751
  },
  "flowPassed": true,
  "startedAt": "2026-09-12T08:42:03.271Z",
  "finishedAt": "2026-09-12T08:42:04.137Z",
  "failure": null,
  "accounting": {
    "nativeRequestAttempts": 4,
    "transportRequests": 4,
    "wireRequestCalls": 4,
    "wireResponses": 4,
    "wireRedirectResponses": 0,
    "followedRedirects": 0,
    "encodedBytes": 34762,
    "decodedBytes": 34762,
    "mockedRequests": 0,
    "note": "Native requests, wire request constructions/responses and mocks are separate; every recorded response body is fresh; wire events are native instrumentation, not packet capture",
    "adapterEntries": 4,
    "admittedRequests": 4,
    "rejectedAdapterEntries": 0,
    "rejectedAdapterSamples": [],
    "admissionScope": "admittedRequests counts adapter calls forwarded to native transport; rejectedAdapterEntries counts calls rejected before forwarding; request-start records are counted separately"
  },
  "responses": [
    {
      "id": 1,
      "url": "https://www.netlib.org/",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-1.body",
      "encodedBytes": 3921,
      "encodedSha256": "e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236",
      "decodedPath": "response-1.body",
      "decodedBytes": 3921,
      "decodedSha256": "e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236",
      "headersPath": "wire-1.headers.json",
      "headersBytes": 980,
      "headersSha256": "9d1b4922f26aabdceed94eb9b6c2ea6cb0b3112057784b2d0ed331ce67b1fd7c",
      "redactedHeaderPairs": 0
    },
    {
      "id": 2,
      "url": "https://www.netlib.org/netlib2.gif",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-2.body",
      "encodedBytes": 6710,
      "encodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "decodedPath": "response-2.body",
      "decodedBytes": 6710,
      "decodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "headersPath": "wire-2.headers.json",
      "headersBytes": 1169,
      "headersSha256": "de1a7d1406abe66d99c6a23b3543d42f6ae27c3462a57ec683e968fb457149bb",
      "redactedHeaderPairs": 0
    },
    {
      "id": 3,
      "url": "https://www.netlib.org/misc/faq.html",
      "status": 200,
      "kind": "document",
      "encoding": "identity",
      "encodedPath": "wire-3.body",
      "encodedBytes": 17421,
      "encodedSha256": "6d73e09dec4d5b0ae4f5aa154bd16d39ad15b3208e6ae3d822e8ad5f049f1dcd",
      "decodedPath": "response-3.body",
      "decodedBytes": 17421,
      "decodedSha256": "6d73e09dec4d5b0ae4f5aa154bd16d39ad15b3208e6ae3d822e8ad5f049f1dcd",
      "headersPath": "wire-3.headers.json",
      "headersBytes": 1203,
      "headersSha256": "9012a8ffad8ac413af64127009d10a1f1ed3cae1885032f6dc88dc7f4c6ef766",
      "redactedHeaderPairs": 0
    },
    {
      "id": 4,
      "url": "https://www.netlib.org/netlib2.gif",
      "status": 200,
      "kind": "image",
      "encoding": "identity",
      "encodedPath": "wire-4.body",
      "encodedBytes": 6710,
      "encodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "decodedPath": "response-4.body",
      "decodedBytes": 6710,
      "decodedSha256": "87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d",
      "headersPath": "wire-4.headers.json",
      "headersBytes": 1169,
      "headersSha256": "9b86f92457667ecff96aa23b5d55f9b8a9c10049102b282e246523f1f1c7e366",
      "redactedHeaderPairs": 0
    }
  ],
  "initialState": {
    "url": "https://www.netlib.org/",
    "title": "The Netlib",
    "root": "e1",
    "nodeCount": 163,
    "revision": 164,
    "sameDocument": true,
    "observedColorScheme": {
      "at": "2026-09-12T08:42:03.637Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.netlib.org/",
      "root": "e1",
      "revision": 164,
      "source": "page.styles.metrics().colorScheme",
      "colorScheme": {
        "preference": null,
        "effective": "light",
        "profile": "native-ua-color-preference",
        "systemIntegration": false,
        "siteOverrides": false
      },
      "sessionPreferenceSource": "session.colorSchemePreference(tabId)",
      "sessionPreference": null
    },
    "history": {
      "key": "h1-1",
      "url": "https://www.netlib.org/",
      "state": null,
      "index": 0,
      "length": 1
    },
    "sessionHistory": {
      "index": 0,
      "length": 1,
      "entries": [
        {
          "key": "h1-1",
          "url": "https://www.netlib.org/",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 31,
      "evictedDocuments": 0
    },
    "scroll": {
      "x": 0,
      "y": 0,
      "maximum": {
        "x": 0,
        "y": 0
      },
      "revision": -1,
      "builds": 0,
      "updates": 0,
      "work": 0,
      "closed": false
    },
    "scrollObservation": "existing native metrics only; no geometry refresh or direct scrolling",
    "nativeRequestAttempts": 2
  },
  "selected": {
    "index": 15,
    "reference": "e133",
    "href": "misc/faq.html",
    "url": "https://www.netlib.org/misc/faq.html",
    "text": "Frequently Asked Questions about Netlib (FAQ)",
    "browsingTarget": "_self",
    "availability": {
      "source": "native styles.get and interactions.actionability before URL deduplication",
      "displayed": true,
      "visible": true,
      "blocked": null,
      "ariaDisabled": false,
      "ancestorDepth": 6,
      "ancestorComplete": true
    },
    "urlQualifies": true,
    "eligible": true,
    "eligibleOccurrences": 2
  },
  "afterClick": {
    "url": "https://www.netlib.org/misc/faq.html",
    "title": "Netlib FAQ",
    "root": "e164",
    "nodeCount": 751,
    "revision": 759,
    "sameDocument": false,
    "observedColorScheme": {
      "at": "2026-09-12T08:42:04.132Z",
      "reason": "before-or-after-click-state",
      "url": "https://www.netlib.org/misc/faq.html",
      "root": "e164",
      "revision": 759,
      "source": "page.styles.metrics().colorScheme",
      "colorScheme": {
        "preference": null,
        "effective": "light",
        "profile": "native-ua-color-preference",
        "systemIntegration": false,
        "siteOverrides": false
      },
      "sessionPreferenceSource": "session.colorSchemePreference(tabId)",
      "sessionPreference": null
    },
    "history": {
      "key": "h2-1",
      "url": "https://www.netlib.org/misc/faq.html",
      "state": null,
      "index": 0,
      "length": 1
    },
    "sessionHistory": {
      "index": 1,
      "length": 2,
      "entries": [
        {
          "key": "h1-1",
          "url": "https://www.netlib.org/",
          "active": false,
          "requiresResubmission": false
        },
        {
          "key": "h2-1",
          "url": "https://www.netlib.org/misc/faq.html",
          "active": true,
          "requiresResubmission": false
        }
      ],
      "retainedBytes": 75,
      "evictedDocuments": 0
    },
    "scroll": {
      "x": 0,
      "y": 0,
      "maximum": {
        "x": 0,
        "y": 0
      },
      "revision": -1,
      "builds": 0,
      "updates": 0,
      "work": 0,
      "closed": false
    },
    "scrollObservation": "existing native metrics only; no geometry refresh or direct scrolling",
    "nativeRequestAttempts": 4
  },
  "ownerEvidence": {
    "eventOwnersInstrumented": 2,
    "imageOwnersInstrumented": 2,
    "eventOwnerCleanupProved": true,
    "imageOwnerCleanupProved": true,
    "documentOwnersInstrumented": 2,
    "controlOwnersInstrumented": 2,
    "documentOwnerCleanupProved": true,
    "controlOwnerCleanupProved": true,
    "scope": "Proof covers only instrumented owners; empty sample arrays do not prove owner cleanup"
  },
  "sourceSha256": "3b212e3dcaf2ff048cc0fb15a08395086be338d399ac7be9ddb24907a449add1",
  "compiledSha256": "e17e8efa3f522ad7c4d9aef4f24e22366fb4cca6f44ae868c53ed72613dcd744"
}
```
