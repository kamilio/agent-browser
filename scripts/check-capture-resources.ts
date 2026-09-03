import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { capturePng } from "../src/capture-client.js";
import { BrowserCommandHost } from "../src/command-host.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { scriptFrame } from "../src/node-script-protocol.js";
import { BrowserSession } from "../src/session.js";

const profiles: Readonly<Record<string, readonly [number, number]>> = {
	small: [640, 480],
	medium: [1280, 720],
	large: [2048, 1024],
};
const profile = process.argv[2];
if (!Object.hasOwn(profiles, profile) || process.argv.length !== 3)
	throw new Error("Choose small, medium or large");
const [width, height] = profiles[profile];
const startedAt = new Date().toISOString();
const samples: {
	stage: string;
	rss: number;
	heapUsed: number;
	arrayBuffers: number;
}[] = [];
function sample(stage: string) {
	const { rss, heapUsed, arrayBuffers } = process.memoryUsage();
	samples.push({ stage, rss, heapUsed, arrayBuffers });
}
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const markup = `<body style="background-color:#101827;color:#dce6ff"><main style="font-size:8px;width:80%;margin:12px auto">${Array.from({ length: 100 }, (_, index) => `<p style="background-color:#ffffff20;margin-bottom:2px">Row ${index}: actual native screenshot bytes.</p>`).join("")}</main></body>`;
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
					requests: 0,
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
let maximumFrameBytes = 0;
let frames = 0;
let completed = false;
let measurement: Record<string, unknown> | undefined;
sample("start");
try {
	await host.execute(["open", "https://fixture.invalid/capture-resources"]);
	await host.execute(["resize", String(width), String(height)]);
	sample("parsed");
	const started = performance.now();
	const cpu = process.cpuUsage();
	const result = await capturePng(async (argv) => {
		const response = await host.execute(argv);
		if (argv[0] === "screenshot") sample("retained-server-artifact");
		const encoded = scriptFrame({ result: response });
		maximumFrameBytes = Math.max(maximumFrameBytes, Buffer.byteLength(encoded));
		frames++;
		return JSON.parse(encoded).result;
	});
	const captureMs = performance.now() - started;
	sample("retained-client-png");
	check(
		"Native dimensions match the requested logical viewport",
		result.artifact.width === width && result.artifact.height === height,
	);
	check(
		"All native PNG bytes arrive",
		result.bytes.length === result.artifact.bytes &&
			result.bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10",
	);
	check(
		"No single protocol frame exceeds one hundred KiB",
		maximumFrameBytes < 102400,
	);
	check(
		"Chunk count is exactly bounded by the artifact length",
		frames === Math.ceil(result.bytes.length / 65536) + 2,
	);
	check(
		"The completed client download releases server artifact storage",
		result.released && host.metrics().captureArtifacts.bytes === 0,
	);
	host.close();
	check(
		"Source closure preserves caller-owned encoded output",
		host.metrics().closed && result.bytes[0] === 137,
	);
	sample("closed-with-client-result-retained");
	measurement = {
		width,
		height,
		captureMs,
		cpu: process.cpuUsage(cpu),
		peakRssBytes: process.resourceUsage().maxRSS * 1024,
		frames,
		maximumFrameBytes,
		pngBytes: result.bytes.length,
		sha256: createHash("sha256").update(result.bytes).digest("hex"),
	};
	completed = true;
} finally {
	host.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"native-in-memory-render-encode-store-framed-transfer-and-release",
				profile,
				node: process.version,
				platform: process.platform,
				architecture: process.arch,
				cpuModel: cpus()[0]?.model,
				realWebsite: false,
				liveSocket: false,
				safeJs: false,
				retainedClientResult: true,
				garbageCollectionForced: false,
				completed,
				passed: checks.filter((check) => check.passed).length,
				checks,
				measurement,
				samples,
			},
			null,
			2,
		),
	);
}
