import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import {
	researchReaderInfo as legacyInfo,
	researchReaderProfile as legacyProfile,
	loadResearchDocument,
} from "./research-loader.js";
import {
	researchReaderInfo,
	researchReaderNotice,
	researchReaderProfile,
	setResearchReaderInfo,
} from "./research-reader-info.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";
import { findInDocument, renderSnapshotSearch } from "./snapshot-search.js";
import {
	diffSnapshots,
	renderSnapshot,
	scanSnapshotEntries,
	snapshotDocument,
} from "./snapshot.js";

const trees: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
const context: DocumentLoaderContext = {
	tabId: "reader-output",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 1000,
		maxDepth: 128,
		maxTextCodeUnits: 10000,
		maxChanges: 1024,
	},
};
const markup =
	'<title>Research</title><main id="main"><h1>Heading</h1><p hidden>Hidden source text</p><p>Visible text</p><svg><text>Omitted image text</text></svg><math><mi>Omitted formula</mi></math><input type="password" value="OMITTED_SECRET"><script>OMITTED_SCRIPT</script></main>';

function reader(source = markup, contentType = "text/html; charset=utf-8") {
	const body = new TextEncoder().encode(source);
	const response: NetworkResponse = {
		url: "https://reader.fixture.invalid/",
		status: 200,
		headers: { "content-type": [contentType] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
	const tree = loadResearchDocument(response, context);
	trees.push(tree);
	return tree;
}

function requiredReport(tree: DocumentTree) {
	const report = researchReaderInfo(tree);
	if (!report) throw new Error("Missing synthetic reader report");
	return report;
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of trees.splice(0)) tree.close();
});

it.each(["snapshot", "extract", "find", "text"])(
	"preserves reader context through native command %s with an in-memory transport",
	async (command) => {
		const host = new BrowserCommandHost({
			createSession: () =>
				new BrowserSession({
					createTransport: () => ({
						async request(input) {
							const body = new TextEncoder().encode(markup);
							return {
								url: input.url,
								status: 200,
								headers: { "content-type": ["text/html; charset=utf-8"] },
								body,
								redirects: [],
								encodedBytes: body.byteLength,
								elapsedMs: 0,
							};
						},
						metrics: () => ({
							requests: 0,
							redirects: 0,
							encodedBytes: 0,
							decodedBytes: 0,
							active: 0,
							closed: false,
						}),
						close() {},
					}),
					loadDocument: loadResearchDocument,
				}),
		});
		hosts.push(host);
		await host.execute(["open", "https://reader.fixture.invalid/"]);
		const result = await host.execute(
			command === "find" ? [command, "Hidden"] : [command],
		);
		if (command === "text")
			expect(result.data).toMatchObject({
				text: expect.stringContaining(researchReaderNotice),
			});
		else
			expect(result.data).toMatchObject({
				reader: {
					profile: researchReaderProfile,
					hiddenContentSemantics: false,
				},
			});
		if (command === "snapshot")
			expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
				reset: false,
				updated: [],
			});
	},
);

it("preserves the existing loader report exports", () => {
	expect(legacyInfo).toBe(researchReaderInfo);
	expect(legacyProfile).toBe(researchReaderProfile);
});

it.each(["markdown", "json"] as const)(
	"attaches exact loader provenance to %s extraction",
	(format) => {
		const tree = reader();
		const report = requiredReport(tree);
		const result = extractDocument(tree, { format });
		expect(result.reader).toBe(report);
		expect(result.reader).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			omittedSubtrees: { svg: 1, math: 1, input: 1, script: 1 },
		});
		expect(JSON.parse(JSON.stringify(result)).reader).toEqual(report);
		for (const omitted of [
			"Omitted image text",
			"Omitted formula",
			"OMITTED_SECRET",
			"OMITTED_SCRIPT",
		])
			expect(JSON.stringify(result.content)).not.toContain(omitted);
		expect(JSON.stringify(result.content)).toContain("Hidden source text");
	},
);

it("carries reader provenance through semantic snapshots and entry scans", () => {
	const tree = reader();
	const snapshot = snapshotDocument(tree);
	const entries: unknown[] = [];
	const scanned = scanSnapshotEntries(tree, (entry) => entries.push(entry));
	expect(snapshot.reader).toBe(requiredReport(tree));
	expect(scanned.reader).toBe(snapshot.reader);
	expect(entries).toEqual(snapshot.entries);
	expect(scanned.scannedEntries).toBe(entries.length);
	expect(renderSnapshot(snapshot).startsWith(`${researchReaderNotice}\n`)).toBe(
		true,
	);
	expect(renderSnapshot(snapshot)).toContain("# HTML partial; JS off");
});

it.each(["text/plain", "application/json", "application/ld+json"])(
	"retains provenance and a visible warning for %s reader documents",
	(type) => {
		const tree = reader(
			type === "text/plain" ? "plain source" : '{"source":"text"}',
			type,
		);
		const result = extractDocument(tree);
		const snapshot = snapshotDocument(tree);
		expect(snapshot.html).toBeUndefined();
		expect(snapshot.reader).toBe(requiredReport(tree));
		expect(result.reader).toBe(snapshot.reader);
		expect(result.reader?.omittedSubtrees).toEqual({});
		expect(renderSnapshot(snapshot)).toContain(researchReaderNotice);
	},
);

it("leaves ordinary native HTML outputs unannotated", () => {
	const tree = parseHtmlDocument(
		"<h1>Ordinary</h1>",
		"https://ordinary.fixture.invalid/",
	);
	trees.push(tree);
	expect(snapshotDocument(tree)).not.toHaveProperty("reader");
	expect(extractDocument(tree)).not.toHaveProperty("reader");
	expect(renderSnapshot(snapshotDocument(tree))).not.toContain(
		researchReaderNotice,
	);
});

it("leaves standalone native text outputs unannotated", () => {
	const tree = new DocumentTree("https://ordinary.fixture.invalid/");
	trees.push(tree);
	const paragraph = tree.createElement("p");
	tree.append(tree.root, paragraph);
	tree.append(paragraph, tree.createText("Ordinary text"));
	expect(snapshotDocument(tree)).not.toHaveProperty("reader");
	expect(extractDocument(tree)).not.toHaveProperty("reader");
	expect(renderSnapshot(snapshotDocument(tree))).not.toContain("#");
});

it("copies and freezes publication metadata and omission counts", () => {
	const tree = reader();
	const original = requiredReport(tree);
	const candidate = { ...original, omittedSubtrees: { svg: 7 } };
	setResearchReaderInfo(tree, candidate);
	const copied = requiredReport(tree);
	expect(Object.isFrozen(copied)).toBe(true);
	expect(Object.isFrozen(copied.omittedSubtrees)).toBe(true);
	candidate.sourceCodeUnits = 0;
	candidate.omittedSubtrees.svg = 99;
	expect(copied.sourceCodeUnits).toBe(original.sourceCodeUnits);
	expect(copied.omittedSubtrees.svg).toBe(7);
	expect(() => Object.assign(copied, { partial: false })).toThrow(TypeError);
	expect(() => Object.assign(copied.omittedSubtrees, { svg: 3 })).toThrow(
		TypeError,
	);
});

it("drops document lookup on close without rewriting retained historical output", () => {
	const tree = reader();
	const output = extractDocument(tree);
	const recorded = JSON.stringify(output);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
	expect(JSON.stringify(output)).toBe(recorded);
});

it("does not register a new cleanup owner for each report replacement", () => {
	const tree = reader();
	const report = requiredReport(tree);
	for (let count = 0; count < 100; count++) setResearchReaderInfo(tree, report);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it("cannot attach provenance again after the document closes", () => {
	const tree = reader();
	const report = requiredReport(tree);
	tree.close();
	expect(() => setResearchReaderInfo(tree, report)).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it("does not confuse independent documents or recalculate load-time counts after mutations", () => {
	const first = reader();
	const second = reader("<p>Second</p>");
	const report = requiredReport(first);
	const added = first.createElement("p");
	first.append(first.root, added);
	first.append(added, first.createText("Added after loading"));
	expect(requiredReport(first)).toBe(report);
	expect(extractDocument(first).reader).toBe(report);
	expect(extractDocument(first).content).toContain("Added after loading");
	expect(requiredReport(second)).not.toBe(report);
	expect(requiredReport(second).omittedSubtrees).toEqual({});
});

it("keeps whole-load provenance on scoped extraction and snapshots", () => {
	const tree = reader();
	const heading = [...tree.walk()].find(
		({ node }) => node.tagName === "h1",
	)?.node;
	if (!heading) throw new Error("Missing synthetic heading");
	const root = tree.reference(heading.id);
	expect(extractDocument(tree, { root }).reader).toBe(requiredReport(tree));
	expect(snapshotDocument(tree, { root }).reader).toBe(requiredReport(tree));
});

it.each(["added", "removed", "changed"] as const)(
	"resets snapshot diffs when provenance is %s",
	(change) => {
		const tree = reader();
		const current = snapshotDocument(tree);
		const without = { ...current, reader: undefined };
		const changed = {
			...current,
			reader: { ...requiredReport(tree), tokens: 1 },
		};
		const [before, after] =
			change === "added"
				? [without, current]
				: change === "removed"
					? [current, without]
					: [current, changed];
		expect(diffSnapshots(before, after)).toEqual({
			reset: true,
			snapshot: after,
		});
	},
);

it("does not reset a diff just because unchanged provenance crossed JSON", () => {
	const current = snapshotDocument(reader());
	expect(
		diffSnapshots(JSON.parse(JSON.stringify(current)), current),
	).toMatchObject({ reset: false, updated: [], removed: [] });
});

it.each(["snapshot", "markdown", "json"] as const)(
	"counts reader metadata toward the %s byte budget",
	(format) => {
		const tree = reader();
		const operation = () =>
			format === "snapshot"
				? snapshotDocument(tree, { maxBytes: 256 })
				: extractDocument(tree, { format, maxBytes: 256 });
		expect(operation).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each([512, 768, 1024])(
	"never publishes an oversized reader snapshot under a %s byte ceiling",
	(maxBytes) => {
		const tree = reader();
		try {
			const result = snapshotDocument(tree, { maxBytes });
			expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
				maxBytes,
			);
			expect(result.reader).toBe(requiredReport(tree));
		} catch (error) {
			expect(error).toMatchObject({ code: "resource-limit" });
		}
	},
);

it("never drops the plain-text warning to satisfy an undersized output budget", () => {
	const snapshot = snapshotDocument(reader());
	expect(() => renderSnapshot(snapshot, 64)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const rendered = renderSnapshot(snapshot, 256);
	expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(256);
	expect(rendered).toContain(researchReaderNotice);
});

it("preserves warning and truncation markers together within a bounded output", () => {
	const tree = reader(`<p>${"Long readable text ".repeat(100)}</p>`);
	const snapshot = snapshotDocument(tree, { maxStringLength: 2048 });
	const rendered = renderSnapshot(snapshot, 256);
	expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(256);
	expect(rendered).toContain(researchReaderNotice);
	expect(rendered).toContain("… snapshot truncated");
});

it("makes ignored hidden-content semantics visible in snapshot searches", () => {
	const tree = reader();
	const search = findInDocument(tree, "Hidden source text");
	expect(search.matched).toBeGreaterThan(0);
	expect(search.reader).toBe(requiredReport(tree));
	expect(
		renderSnapshotSearch(search).startsWith(`${researchReaderNotice}\n`),
	).toBe(true);
});

it("counts search provenance toward the JSON result byte ceiling", () => {
	const tree = reader(markup.repeat(3));
	const search = findInDocument(tree, "text", { maxBytes: 1024 });
	expect(search.reader).toBe(requiredReport(tree));
	expect(Buffer.byteLength(JSON.stringify(search))).toBeLessThanOrEqual(1024);
});

it("does not add reader metadata or notices to ordinary native search", () => {
	const tree = parseHtmlDocument(
		"<p>Ordinary text</p>",
		"https://ordinary.fixture.invalid/",
	);
	trees.push(tree);
	const search = findInDocument(tree, "Ordinary");
	expect(search).not.toHaveProperty("reader");
	expect(renderSnapshotSearch(search)).not.toContain(researchReaderNotice);
});
