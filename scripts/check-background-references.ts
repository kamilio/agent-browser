import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentBrowserError } from "../src/errors.js";
import type { PageScriptCore } from "../src/page-scripts.js";
import {
	compareReferenceImages,
	referenceVerdict,
} from "./reference-images.js";
import { renderReferenceHtml } from "./reference-renderer.js";
import { loadExtendedCore } from "./extended-safejs-core.js";
import {
	backgroundReferenceInputs,
	backgroundReferenceRevision,
} from "./background-reference-manifest.js";

if (process.argv.length !== 3)
	throw new Error("Provide the pinned WPT source directory");
const startedAt = new Date().toISOString();
const sourceRoot = resolve(process.argv[2]);
const revision = backgroundReferenceRevision;
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const directory = "css/css-backgrounds/";
const green = `${directory}background-color-body-propagation-ref.html`;
const blank = "css/reference/blank.html";
const noPropagation = `${directory}background-color-no-body-propagation-ref.html`;
const cases = [
	{ file: "background-color-body-propagation-001.html", reference: green },
	{ file: "background-color-body-propagation-002.html", reference: green },
	{
		file: "background-color-body-propagation-003.html",
		reference: green,
	},
	{ file: "background-color-body-propagation-004.html", reference: blank },
	{ file: "background-color-body-propagation-005.html", reference: blank },
	{ file: "background-color-body-propagation-006.html", reference: blank },
	{ file: "background-color-body-propagation-007.html", reference: blank },
	{
		file: "background-color-body-propagation-008.html",
		reference: noPropagation,
		unsupported: "CSS paint containment",
	},
	{
		file: "background-color-body-propagation-009.html",
		reference: noPropagation,
		unsupported: "CSS paint containment",
	},
	{
		file: "background-color-body-propagation-010.html",
		reference: noPropagation,
		unsupported: "generated pseudo-element content",
	},
	{ file: "background-color-root-propagation-001.html", reference: blank },
	{ file: "background-color-root-propagation-002.html", reference: blank },
	{
		file: "background-color-root-propagation-003.html",
		reference: noPropagation,
		unsupported: "generated pseudo-element content",
	},
];
const inputs = new Map<
	string,
	{ source: string; sha256: string; bytes: number }
>();
for (const path of new Set(
	cases.flatMap((entry) => [directory + entry.file, entry.reference]),
)) {
	const expected = backgroundReferenceInputs[path];
	if (
		!expected ||
		!Number.isSafeInteger(expected.bytes) ||
		expected.bytes < 1 ||
		expected.bytes > 262_144
	)
		throw new Error("Invalid reference input manifest");
	const handle = await open(resolve(sourceRoot, path), "r");
	const buffer = Buffer.alloc(expected.bytes + 1);
	let length = 0;
	try {
		const stat = await handle.stat();
		if (!stat.isFile() || stat.size !== expected.bytes)
			throw new Error(`Pinned reference source integrity mismatch: ${path}`);
		while (length < buffer.length) {
			const result = await handle.read(
				buffer,
				length,
				buffer.length - length,
				null,
			);
			if (!result.bytesRead) break;
			length += result.bytesRead;
		}
	} finally {
		await handle.close();
	}
	const bytes = buffer.subarray(0, length);
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	if (expected.bytes !== bytes.length || expected.sha256 !== sha256)
		throw new Error(`Pinned reference source integrity mismatch: ${path}`);
	inputs.set(path, {
		source: bytes.toString("utf8"),
		sha256,
		bytes: bytes.length,
	});
}
const results: {
	file: string;
	reference: string;
	status: string;
	[key: string]: unknown;
}[] = [];
for (const entry of cases) {
	const file = directory + entry.file;
	if (entry.unsupported) {
		results.push({
			file,
			reference: entry.reference,
			status: "unsupported",
			reason: entry.unsupported,
		});
		continue;
	}
	try {
		const testInput = inputs.get(file);
		const referenceInput = inputs.get(entry.reference);
		if (!testInput || !referenceInput)
			throw new Error("Missing verified reference input");
		const test = await renderReferenceHtml(testInput.source, {
			url: `https://reference.invalid/${file}`,
			width: 800,
			height: 600,
			core,
		});
		const reference = await renderReferenceHtml(referenceInput.source, {
			url: `https://reference.invalid/${entry.reference}`,
			width: 800,
			height: 600,
			core,
		});
		const difference = compareReferenceImages(test.image, reference.image);
		results.push({
			file,
			reference: entry.reference,
			status: referenceVerdict(difference, "match"),
			difference,
			test: {
				sha256: createHash("sha256").update(test.image.pixels).digest("hex"),
				timings: test.timings,
				work: test.work,
				scripts: test.scripts,
				animationFrames: test.animationFrames,
			},
			expected: {
				sha256: createHash("sha256")
					.update(reference.image.pixels)
					.digest("hex"),
				timings: reference.timings,
				work: reference.work,
			},
		});
	} catch (error) {
		results.push({
			file,
			reference: entry.reference,
			status:
				error instanceof AgentBrowserError && error.code === "unsupported"
					? "unsupported"
					: "error",
			error:
				error instanceof AgentBrowserError ? error.code : "unexpected-error",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
}
const counts = Object.fromEntries(
	["pass", "fail", "unsupported", "error"].map((status) => [
		status,
		results.filter((result) => result.status === status).length,
	]),
);
const supportedCasesPassed = cases.every((entry, index) =>
	entry.unsupported
		? results[index].status === "unsupported"
		: results[index].status === "pass",
);
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			revision,
			viewport: { width: 800, height: 600 },
			counts,
			supportedCasesPassed,
			fullySupported: counts.unsupported === 0,
			runtime: "existing experimental SafeJS core, not released-SDK acceptance",
			inputs: [...inputs].map(([file, input]) => ({
				file,
				sha256: input.sha256,
				bytes: input.bytes,
			})),
			results,
			limitations:
				"Selected offline upstream reftests, not the WPT runner or full conformance. Test/reference share this partial renderer and Agent Mono bitmap font. Exact RGBA comparison; no tolerance. No network or sockets, no real-site/Worker acceptance.",
		},
		null,
		2,
	),
);
if (!supportedCasesPassed) process.exitCode = 1;
