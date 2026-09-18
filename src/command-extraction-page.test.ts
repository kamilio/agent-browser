import { afterEach, expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import type { DocumentTree } from "./document.js";
import type { DocumentExtractionPage } from "./extraction-page.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
const url = "https://extraction-pages.fixture.invalid/discussion";

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture(reader = false) {
	const trees: DocumentTree[] = [];
	const requests: string[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				return {
					url: input.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					encodedBytes: 0,
					redirects: [],
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument(response) {
			const source =
				'<main><p class="comment">First <code> \t </code></p><p class="comment">Second</p><p class="comment">Third</p></main>';
			const tree = reader
				? loadResearchDocument(
						{
							...response,
							headers: { "content-type": ["text/html; charset=utf-8"] },
							body: new TextEncoder().encode(source),
						},
						{
							tabId: "shared-reader",
							signal: new AbortController().signal,
							limits: {
								maxNodes: 100,
								maxDepth: 16,
								maxTextCodeUnits: 1000,
								maxChanges: 100,
							},
						},
					)
				: parseHtmlDocument(source, response.url);
			trees.push(tree);
			return tree;
		},
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", url]);
	return { host, trees, requests };
}

it("registers bounded extraction page options", () => {
	expect(
		parseInvocation([
			"extract-page",
			".comment",
			"--limit=2",
			"--max-bytes=4096",
			"--item-max-bytes=1024",
			"--format=markdown",
			"--table-rows",
			"--compact-tables",
			"--max-nodes=100",
			"--depth=20",
		]),
	).toMatchObject({
		command: "extract-page",
		arguments: [".comment"],
		options: {
			limit: 2,
			"max-bytes": 4096,
			"item-max-bytes": 1024,
			format: "markdown",
			"table-rows": true,
			"compact-tables": true,
			"max-nodes": 100,
			depth: 20,
		},
	});
});

it.each(["entry", "page"])(
	"parses reader metadata placement %s",
	(placement) => {
		expect(
			parseInvocation([
				"extract-page",
				".comment",
				`--reader-metadata=${placement}`,
			]),
		).toMatchObject({ options: { "reader-metadata": placement } });
	},
);

it.each([
	{ reader: false, format: "markdown" },
	{ reader: true, format: "markdown" },
	{ reader: false, format: "json" },
	{ reader: true, format: "json" },
])(
	"shares reader metadata without changing entries: $reader/$format",
	async ({ reader, format }) => {
		const { host, requests } = await fixture(reader);
		const normal = (
			await host.execute(["extract-page", ".comment", `--format=${format}`])
		).data as DocumentExtractionPage;
		const shared = (
			await host.execute([
				"extract-page",
				".comment",
				`--format=${format}`,
				"--reader-metadata=page",
			])
		).data as DocumentExtractionPage;
		expect(shared.readerMetadata).toBe("page");
		expect(shared.reader).toEqual(normal.entries[0].reader);
		for (const entry of shared.entries)
			expect(entry).not.toHaveProperty("reader");
		expect(
			shared.entries.map((entry) =>
				shared.reader ? { ...entry, reader: shared.reader } : entry,
			),
		).toEqual(normal.entries);
		expect(shared.nextCursor).toBe(normal.nextCursor);
		expect(requests).toEqual([url]);
	},
);

it.each([false, true])(
	"preserves explicit entry mode output with reader %s",
	async (reader) => {
		const { host } = await fixture(reader);
		const normal = (await host.execute(["extract-page", ".comment"])).data;
		const explicit = (
			await host.execute([
				"extract-page",
				".comment",
				"--reader-metadata=entry",
			])
		).data;
		expect(JSON.stringify(explicit)).toBe(JSON.stringify(normal));
	},
);

it("counts shared reader metadata in the command's exact page bound", async () => {
	const { host, requests } = await fixture(true);
	const full = (
		await host.execute(["extract-page", ".comment", "--reader-metadata=page"])
	).data as DocumentExtractionPage;
	const cap = Math.max(
		1024,
		new TextEncoder().encode(JSON.stringify(full)).length,
	);
	const shared = (
		await host.execute([
			"extract-page",
			".comment",
			"--reader-metadata=page",
			`--max-bytes=${cap}`,
		])
	).data as DocumentExtractionPage;
	const normal = (
		await host.execute(["extract-page", ".comment", `--max-bytes=${cap}`])
	).data as DocumentExtractionPage;
	expect(shared.entries).toHaveLength(3);
	expect(shared.selectionExhausted).toBe(true);
	expect(normal.entries.length).toBeLessThan(shared.entries.length);
	expect(
		new TextEncoder().encode(JSON.stringify(shared)).length,
	).toBeLessThanOrEqual(cap);
	expect(requests).toEqual([url]);
});

it.each(["none", "true", ""])(
	"rejects invalid reader metadata placement %j",
	async (placement) => {
		const { host, requests } = await fixture();
		await expect(
			host.execute([
				"extract-page",
				".comment",
				`--reader-metadata=${placement}`,
			]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(requests).toEqual([url]);
	},
);

it.each(
	[
		["extract-page"],
		["extract-page", "p", "extra"],
		["extract-page", "p", "--limit=0"],
		["extract-page", "p", "--limit=101"],
		["extract-page", "p", "--limit=1.5"],
		["extract-page", "p", "--max-bytes=1023"],
		["extract-page", "p", "--max-bytes=1048577"],
		["extract-page", "p", "--item-max-bytes=255"],
		["extract-page", "p", "--max-nodes=50001"],
		["extract-page", "p", "--depth=1025"],
		["extract-page", "p", "--content-focus=main-content-v3"],
	].map((args) => ({ args })),
)("rejects invalid page command arguments $args", ({ args }) => {
	expect(() => parseInvocation(args)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("pages the active document without another request or text loss", async () => {
	const { host, trees, requests } = await fixture();
	const revision = trees[0].revision;
	const first = (await host.execute(["extract-page", ".comment", "--limit=2"]))
		.data as DocumentExtractionPage;
	expect(first).toMatchObject({
		method: "selector-extraction-page-v1",
		start: 0,
		totalMatches: 3,
		selectionExhausted: false,
		partial: true,
	});
	expect(first.entries.map((entry) => entry.content)).toEqual([
		"First `  \t  `\n",
		"Second\n",
	]);
	expect(typeof first.nextCursor).toBe("string");
	const second = (
		await host.execute([
			"extract-page",
			".comment",
			"--cursor",
			first.nextCursor as string,
			"--limit=2",
		])
	).data as DocumentExtractionPage;
	expect(second).toMatchObject({
		start: 2,
		totalMatches: 3,
		nextCursor: null,
		selectionExhausted: true,
		partial: true,
	});
	expect(second.entries.map((entry) => entry.content)).toEqual(["Third\n"]);
	expect(trees[0].revision).toBe(revision);
	expect(requests).toEqual([url]);
});

it("keeps structured page contents inside the page envelope", async () => {
	const { host } = await fixture();
	const result = (
		await host.execute([
			"extract-page",
			".comment",
			"--limit=1",
			"--format=json",
		])
	).data as DocumentExtractionPage;
	expect(result.entries[0]).toMatchObject({
		format: "json",
		content: { type: "paragraph" },
	});
	expect(result.nextCursor).not.toBeNull();
});

it("rejects a cursor after a document edit", async () => {
	const { host, trees } = await fixture();
	const first = (await host.execute(["extract-page", ".comment", "--limit=1"]))
		.data as DocumentExtractionPage;
	trees[0].setAttribute(
		trees[0].get(trees[0].root).children[0],
		"data-change",
		"changed",
	);
	await expect(
		host.execute([
			"extract-page",
			".comment",
			"--cursor",
			first.nextCursor as string,
		]),
	).rejects.toMatchObject({ code: "stale-reference" });
});

it("rejects a cursor after navigation replaces the document", async () => {
	const { host } = await fixture();
	const first = (await host.execute(["extract-page", ".comment", "--limit=1"]))
		.data as DocumentExtractionPage;
	await host.execute(["goto", `${url}?next`]);
	await expect(
		host.execute([
			"extract-page",
			".comment",
			"--cursor",
			first.nextCursor as string,
		]),
	).rejects.toMatchObject({ code: "stale-reference" });
});

it.each(
	[["--cursor=not-json"], ["--item-max-bytes=4096", "--max-bytes=1024"]].map(
		(flags) => ({ flags }),
	),
)("rejects invalid page semantics $flags", async ({ flags }) => {
	const { host, requests } = await fixture();
	await expect(
		host.execute(["extract-page", ".comment", ...flags]),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(requests).toEqual([url]);
});

it("retains the unsupported format error", async () => {
	const { host } = await fixture();
	await expect(
		host.execute(["extract-page", ".comment", "--format=pdf"]),
	).rejects.toMatchObject({ code: "unsupported" });
});
