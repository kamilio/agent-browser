import { BrowserCommandHost } from "../src/command-host.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { BrowserSession } from "../src/session.js";

const startedAt = new Date().toISOString();
const rows: unknown[] = [];
for (const elements of [64, 512, 4096]) {
	for (const recording of [false, true]) {
		const samples: unknown[] = [];
		for (let pass = 0; pass < 3; pass++) {
			const markup = `<input id="field" aria-label="Value">${Array.from({ length: elements }, (_, index) => `<p>Entry ${index}</p>`).join("")}`;
			const host = new BrowserCommandHost({
				createSession: () =>
					new BrowserSession({
						createTransport: () => ({
							async request(input) {
								return {
									url: input.url,
									status: 200,
									headers: {},
									body: new Uint8Array(),
									redirects: [],
									encodedBytes: 0,
									elapsedMs: 0,
								};
							},
							metrics: () => ({
								requests: 1,
								active: 0,
								redirects: 0,
								encodedBytes: 0,
								decodedBytes: 0,
								closed: false,
							}),
							close() {},
						}),
						loadDocument: (response) => parseHtmlDocument(markup, response.url),
					}),
			});
			try {
				await host.execute(["open", "https://fixture.invalid/trace-scale"]);
				const setup = performance.now();
				if (recording) await host.execute(["tracing-start"]);
				const setupMs = performance.now() - setup;
				const start = performance.now();
				for (let index = 0; index < 32; index++)
					await host.execute(["fill", "#field", `value-${index}`]);
				const commandsMs = performance.now() - start;
				const end = performance.now();
				const artifact = recording
					? (await host.execute(["tracing-stop"])).data
					: null;
				samples.push({
					commandsMs,
					setupMs,
					exportMs: performance.now() - end,
					artifact,
				});
			} finally {
				host.close();
			}
		}
		rows.push({ elements, recording, commands: 32, samples });
	}
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			passed: true,
			rows,
			peakRssKiB: process.resourceUsage().maxRSS,
			method:
				"Three fresh synthetic sessions per size/mode; 32 identical fill commands. Timed commands include tracing's after-command snapshots/serialization when enabled. Parsing/open and trace start/export are outside command timing. No SafeJS, sockets, public sites, raster or forced GC; cumulative process peak RSS is not retained-page memory.",
		},
		null,
		2,
	),
);
