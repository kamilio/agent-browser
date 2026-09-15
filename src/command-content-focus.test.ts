import { afterEach, expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import type { DocumentExtraction } from "./extraction.js";
import type { NetworkTransport } from "./network.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
const url = "https://content-focus.fixture.invalid/";
const focusFlag = "--content-focus=main-content-v1";

async function fixture(
	mains = ["Main evidence"],
	articles = ["Article evidence"],
) {
	const tree = new DocumentTree(url);
	const body = tree.createElement("body");
	tree.append(tree.root, body);
	function append(tag: string, text: string, id: string) {
		const node = tree.createElement(tag, { id });
		tree.append(body, node);
		tree.setTextContent(node, text);
		return node;
	}
	append("nav", "Navigation outside landmarks", "navigation");
	const articleNodes = articles.map((text, index) =>
		append("article", text, `article-${index}`),
	);
	const mainNodes = mains.map((text, index) =>
		append("main", text, `main-${index}`),
	);
	append("footer", "Footer outside landmarks", "footer");
	const requests: string[] = [];
	let closed = false;
	const transport: NetworkTransport = {
		async request(input) {
			requests.push(input.url);
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
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: () => tree,
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", url]);
	return { host, session, tree, mainNodes, articleNodes, requests };
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

it.each([["--content-focus", "main-content-v1"], [focusFlag]])(
	"parses the string content-focus option %j",
	(...flags) => {
		expect(
			parseInvocation(["extract", ...flags, "--format=json"]),
		).toMatchObject({
			command: "extract",
			arguments: [],
			options: { "content-focus": "main-content-v1", format: "json" },
		});
	},
);

it("leaves content focus absent by default and defers policy validation to core", () => {
	expect(parseInvocation(["extract"]).options).not.toHaveProperty(
		"content-focus",
	);
	expect(
		parseInvocation(["extract", "--content-focus=false"]).options,
	).toHaveProperty("content-focus", "false");
	expect(parseInvocation(["extract", "#main-0", focusFlag])).toMatchObject({
		arguments: ["#main-0"],
		options: { "content-focus": "main-content-v1" },
	});
});

it.each([
	["extract", "--content-focus"],
	["extract", "--content-focus="],
	["extract", "--content-focus", "--format=json"],
	["snapshot", focusFlag],
	["html", focusFlag],
	["dom", focusFlag],
])("rejects missing values and unrelated commands %j", (...args) => {
	expect(() => parseInvocation(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["markdown", "json"] as const)(
	"selects a unique main before an earlier article in %s without changing defaults",
	async (format) => {
		const { host, session, tree, mainNodes, requests } = await fixture();
		const tabs = session.tabs();
		const baseline = (await host.execute(["extract", `--format=${format}`]))
			.data as DocumentExtraction;
		expect(baseline.scope).toBe(tree.reference(tree.root));
		expect(baseline).not.toHaveProperty("contentSelection");
		for (const text of [
			"Main evidence",
			"Article evidence",
			"Navigation outside landmarks",
			"Footer outside landmarks",
		])
			expect(JSON.stringify(baseline.content)).toContain(text);
		const result = (
			await host.execute(["extract", focusFlag, `--format=${format}`])
		).data as DocumentExtraction;
		expect(result).toMatchObject({
			format,
			document: tree.reference(tree.root),
			scope: tree.reference(mainNodes[0]),
			contentSelection: {
				policy: "main-content-v1",
				selected: "main",
				reason: "unique-main",
				mainCandidates: 1,
				articleCandidates: 1,
				scannedNodes: tree.nodeCount,
			},
		});
		expect(JSON.stringify(result.content)).toContain("Main evidence");
		for (const text of [
			"Article evidence",
			"Navigation outside landmarks",
			"Footer outside landmarks",
		])
			expect(JSON.stringify(result.content)).not.toContain(text);
		if (result.format === "json")
			expect(result.content.ref).toBe(tree.reference(mainNodes[0]));
		expect(
			(await host.execute(["extract", `--format=${format}`])).data,
		).toEqual(baseline);
		if (format === "markdown")
			expect((await host.execute(["extract", focusFlag])).data).toEqual(result);
		expect(session.tabs()).toEqual(tabs);
		expect(requests).toEqual([url]);
	},
);

it.each([
	{
		label: "absent main",
		mains: [],
		articles: ["Article evidence"],
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
	},
	{
		label: "whitespace-only main",
		mains: [" \n\t "],
		articles: ["Article evidence"],
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
	},
	{
		label: "ambiguous mains despite a unique article",
		mains: ["First main", "Second main"],
		articles: ["Article evidence"],
		selected: "document",
		reason: "ambiguous-main",
		mainCandidates: 2,
		articleCandidates: 1,
	},
	{
		label: "ambiguous articles without a main",
		mains: [],
		articles: ["First article", "Second article"],
		selected: "document",
		reason: "ambiguous-article",
		mainCandidates: 0,
		articleCandidates: 2,
	},
	{
		label: "absent landmarks",
		mains: [],
		articles: [],
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	},
	{
		label: "whitespace-only landmarks",
		mains: [" \n "],
		articles: ["\t"],
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	},
])("reports selection and fallback for $label", async (scenario) => {
	const { host, tree, articleNodes, requests } = await fixture(
		scenario.mains,
		scenario.articles,
	);
	for (const format of ["markdown", "json"]) {
		const baseline = (await host.execute(["extract", `--format=${format}`]))
			.data as DocumentExtraction;
		const result = (
			await host.execute(["extract", focusFlag, `--format=${format}`])
		).data as DocumentExtraction;
		expect(result).toMatchObject({
			format,
			scope: tree.reference(
				scenario.selected === "article" ? articleNodes[0] : tree.root,
			),
			contentSelection: {
				policy: "main-content-v1",
				selected: scenario.selected,
				reason: scenario.reason,
				mainCandidates: scenario.mainCandidates,
				articleCandidates: scenario.articleCandidates,
				scannedNodes: tree.nodeCount,
			},
		});
		if (scenario.selected === "document")
			expect(result.content).toEqual(baseline.content);
		else {
			expect(JSON.stringify(result.content)).toContain("Article evidence");
			expect(JSON.stringify(result.content)).not.toContain(
				"Navigation outside landmarks",
			);
			expect(JSON.stringify(result.content)).not.toContain(
				"Footer outside landmarks",
			);
		}
	}
	expect(requests).toEqual([url]);
});

it("rejects invalid policies and positional roots without navigating or changing defaults", async () => {
	const { host, session, tree, mainNodes, requests } = await fixture();
	const tabs = session.tabs();
	const baseline = await host.execute(["extract"]);
	for (const policy of ["false", "true", "main", "main-content-v2", " "])
		await expect(
			host.execute(["extract", `--content-focus=${policy}`]),
		).rejects.toMatchObject({ code: "invalid-input" });
	for (const target of ["#main-0", tree.reference(mainNodes[0])]) {
		await expect(
			host.execute(["extract", target, focusFlag]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect((await host.execute(["extract", target])).data).toMatchObject({
			scope: tree.reference(mainNodes[0]),
		});
	}
	await expect(
		host.execute(["extract", focusFlag, "--format=pdf"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect((await host.execute(["extract"])).data).toEqual(baseline.data);
	expect(session.tabs()).toEqual(tabs);
	expect(requests).toEqual([url]);
});

it("bounds the whole-document selection scan even when the selected main is small", async () => {
	const { host, tree, mainNodes, requests } = await fixture();
	const args = ["extract", focusFlag, "--format=json"];
	const baseline = (await host.execute(args)).data as DocumentExtraction;
	for (const limit of [`--max-nodes=${tree.nodeCount - 1}`, "--depth=2"])
		await expect(host.execute([...args, limit])).rejects.toMatchObject({
			code: "resource-limit",
			message: "Content focus scan limit exceeded",
		});
	const bounded = (
		await host.execute([...args, `--max-nodes=${tree.nodeCount}`, "--depth=3"])
	).data as DocumentExtraction;
	expect(bounded).toEqual(baseline);
	expect(bounded.scope).toBe(tree.reference(mainNodes[0]));
	for (const limit of [
		"--max-nodes=0",
		"--max-nodes=50001",
		"--max-bytes=255",
		"--depth=1025",
	])
		await expect(host.execute([...args, limit])).rejects.toMatchObject({
			code: "invalid-input",
		});
	expect(requests).toEqual([url]);
});

it.each(["markdown", "json"] as const)(
	"enforces %s output limits and reads current content without refetching",
	async (format) => {
		const { host, tree, mainNodes, requests } = await fixture();
		const args = ["extract", focusFlag, `--format=${format}`];
		await host.execute(args);
		tree.setTextContent(mainNodes[0], "Updated evidence ".repeat(400));
		await expect(
			host.execute([...args, "--max-bytes=1024"]),
		).rejects.toMatchObject({ code: "resource-limit" });
		const result = (await host.execute([...args, "--max-bytes=16384"]))
			.data as DocumentExtraction;
		expect(result).toMatchObject({
			format,
			scope: tree.reference(mainNodes[0]),
			revision: tree.revision,
			contentSelection: { selected: "main", reason: "unique-main" },
		});
		expect(JSON.stringify(result.content)).toContain("Updated evidence");
		expect(JSON.stringify(result.content)).not.toContain("Main evidence");
		expect(
			new TextEncoder().encode(JSON.stringify(result)).byteLength,
		).toBeLessThanOrEqual(16384);
		expect(requests).toEqual([url]);
	},
);
