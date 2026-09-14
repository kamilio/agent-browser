# Website inventory: September 14 thirtieth update

Two fresh native-reader batches make seven HTTP requests for six document seeds
across four hosts. One request is a redirect; this is not a new global coverage
total. Five documents yield checked content, counting three explicitly partial
Wikipedia sections. No visual or interaction success is inferred.

| Exact document seed | Result |
| --- | --- |
| `https://crfm.stanford.edu/helm/` | HTTP200;1,295 decoded bytes; empty extraction. Captured body has an empty application root and module scripts. The native reader does not execute them. |
| `https://github.com/ggml-org/llama.cpp` | HTTP200;54,291 Markdown bytes. Checked actual README content covering Apple silicon, CUDA and other backends, not just site navigation. |
| `https://huggingface.co/docs/transformers/perf_infer_gpu_one` | HTTP200 after one redirect to `https://huggingface.co/docs/transformers/v5.17.0/optimization_overview`;18,431 Markdown bytes. Optimization and memory/speed discussion checked. |
| `https://en.wikipedia.org/wiki/Large_language_model` | HTTP200; typed whole-page output quota failure. Explicit offline CLI recovers History, Evaluation and Limitations and challenges without another HTTP request. |
| `https://crfm.stanford.edu/2022/11/17/helm.html` | HTTP200;19,690 Markdown bytes. Benchmark metric, robustness and fairness discussion checked. This is a separate explicit seed, not a link discovered from the empty HELM app. |
| `https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md` | HTTP200;61,791 Markdown bytes. CPU/Metal/CUDA build content checked. URL genuinely discovered from the preceding README; HTTP excludes its fragment. |

First batch:17:49:43–17:49:44UTC, runtime5c7a882, four requests including the
Hugging Face redirect. Second:18:00:39–18:00:40UTC, compiled isolated recovery
candidate described in `CONTENT-SECTION-RECOVERY.md`, three requests. Both have
zero mocked requests, closed transport and no remaining child/process group;
private HOME/TMP remain empty. Mixed-result exit2 is retained for each batch.

The research is **not complete**. These primary-source pages provide usable
material for local-inference hardware/software tradeoffs and benchmark caveats;
they do not establish a current best-value hardware ranking. The HELM app still
has no reader content. No fresh X/Astra investigation or Reddit/Poe opinions are
claimed. Reddit's earlier403 remains an access block, without retry or bypass.

Historical evidence and timings stay unchanged. New raw observations, decoded
body hashes, content checks and link-discovery provenance are retained in the
three cache evidence directories named by `CONTENT-SECTION-RECOVERY.md`.
