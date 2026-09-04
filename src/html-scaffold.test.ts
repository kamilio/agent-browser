import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentMode } from "./document-mode.js";
import { htmlParseInfo } from "./html-info.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("starts the asynchronous parser with only the document allocated", async () => {
	const counts: number[] = [];
	const roots: number[][] = [];
	const tree = await parseHtmlDocumentAsync(
		"<p>text",
		"https://example.test/",
		{},
		{
			start(owner) {
				counts.push(owner.nodeCount);
				roots.push([...owner.get(owner.root).children]);
			},
			async script() {},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(counts).toEqual([1]);
	expect(roots).toEqual([[]]);
});

it("inserts leading comments and doctypes before allocating document elements", () => {
	const observed: [string, number][] = [];
	const tree = parseHtmlDocument(
		"<!--first--><!doctype html><p>text",
		"https://example.test/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes) {
						const node = owner.get(id);
						if (node.kind === "comment" || node.kind === "doctype")
							observed.push([node.kind, owner.nodeCount]);
					}
				});
			},
		},
	);
	trees.push(tree);
	expect(observed).toEqual([
		["comment", 2],
		["doctype", 3],
	]);
});

it("publishes explicit scaffold elements with their token attributes already present", () => {
	const observed: [string, string | undefined][] = [];
	const tree = parseHtmlDocument(
		"<html id=root><head id=metadata></head><body id=content>",
		"https://example.test/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes) {
						const node = owner.get(id);
						if (["html", "head", "body"].includes(node.tagName))
							observed.push([node.tagName, node.attributes.id]);
					}
				});
			},
		},
	);
	trees.push(tree);
	expect(observed).toEqual([
		["html", "root"],
		["head", "metadata"],
		["body", "content"],
	]);
});

it.each([
	"",
	" \n",
	"<!--only-->",
	"</span></div>",
	"<!doctype html>",
	"<html>",
	"<head>",
	"<head><noscript>",
	"<head></head>",
])("creates missing scaffold elements at EOF for %s", (source) => {
	const order: string[] = [];
	const modes: string[] = [];
	const tree = parseHtmlDocument(source, "https://example.test/", {
		initializeDocument(owner) {
			owner.onMutation((record) => {
				for (const id of record.addedNodes) {
					const node = owner.get(id);
					if (["html", "head", "body"].includes(node.tagName)) {
						order.push(node.tagName);
						modes.push(documentMode(owner));
					}
				}
			});
		},
	});
	trees.push(tree);
	expect(order).toEqual(["html", "head", "body"]);
	expect(modes).toEqual(
		Array(3).fill(source.includes("doctype") ? "no-quirks" : "quirks"),
	);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("does not allocate a head before a before-head comment or a body before after-head comments", () => {
	const observed: [string, number, string[]][] = [];
	const tree = parseHtmlDocument(
		"<html><!--before--><head></head><!--after--><body>",
		"https://example.test/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes) {
						const node = owner.get(id);
						if (node.kind === "comment")
							observed.push([
								node.data,
								owner.nodeCount,
								[...owner.walk()]
									.filter(({ node }) => node.kind === "element")
									.map(({ node }) => node.tagName),
							]);
					}
				});
			},
		},
	);
	trees.push(tree);
	expect(observed).toEqual([
		["before", 3, ["html"]],
		["after", 5, ["html", "head"]],
	]);
});

it.each(["<script>early</script>", "<head></head><script>late</script>"])(
	"has no detached body allocation at the %s checkpoint",
	async (source) => {
		let allocated = 0;
		let connected = 0;
		const tree = await parseHtmlDocumentAsync(
			source,
			"https://example.test/",
			{},
			{
				start() {},
				async script(owner) {
					allocated = owner.nodeCount;
					connected = [...owner.walk()].length;
				},
				async finish() {},
			},
		);
		trees.push(tree);
		expect(allocated).toBe(5);
		expect(connected).toBe(5);
	},
);

it.each(["html", "head", "body"])(
	"does not recreate a %s detached by an insertion collector",
	(tag) => {
		let detached: number | undefined;
		const inserted: string[] = [];
		const tree = parseHtmlDocument(
			"<html><head></head><body><p>text",
			"https://example.test/",
			{
				initializeDocument(owner) {
					owner.onMutation((record) => {
						for (const id of record.addedNodes) {
							const node = owner.get(id);
							inserted.push(node.tagName);
							if (node.tagName === tag && detached === undefined) {
								detached = id;
								owner.remove(id);
							}
						}
					});
				},
			},
		);
		trees.push(tree);
		expect(detached).toBeDefined();
		expect(tree.get(detached ?? -1).parent).toBeNull();
		expect(inserted.filter((name) => name === tag)).toHaveLength(1);
		expect(tree.mutationMetrics().collectorFailures).toBe(0);
	},
);

it("retains saved head identity for late metadata after detachment", async () => {
	let detached: number | undefined;
	const tree = await parseHtmlDocumentAsync(
		"<script>detach</script></head><meta name=late><body>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(owner, id) {
				detached = owner.get(id).parent ?? undefined;
				owner.remove(detached ?? -1);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(
		tree.get(detached ?? -1).children.map((id) => tree.get(id).tagName),
	).toEqual(["script", "meta"]);
	expect([...tree.walk()].some(({ node }) => node.tagName === "head")).toBe(
		false,
	);
});

it("merges repeated scaffold attributes without republishing the nodes", () => {
	const inserted: string[] = [];
	const tree = parseHtmlDocument(
		"<html id=first><head id=head></head><body id=body><html id=second lang=en><body id=second class=extra>",
		"https://example.test/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes)
						inserted.push(owner.get(id).tagName);
				});
			},
		},
	);
	trees.push(tree);
	expect(inserted).toEqual(["html", "head", "body"]);
	expect(serializeHtml(tree, tree.root)).toBe(
		'<html id="first" lang="en"><head id="head"></head><body id="body" class="extra"></body></html>',
	);
});

it.each(["html", "head", "body"])(
	"does not restore an initial %s attribute removed during insertion",
	(tag) => {
		const tree = parseHtmlDocument(
			"<html id=root><head id=metadata></head><body id=content>",
			"https://example.test/",
			{
				initializeDocument(owner) {
					owner.onMutation((record) => {
						for (const id of record.addedNodes)
							if (owner.get(id).tagName === tag)
								owner.removeAttribute(id, "id");
					});
				},
			},
		);
		trees.push(tree);
		const target = [...tree.walk()].find(({ node }) => node.tagName === tag);
		expect(target?.node.attributes.id).toBeUndefined();
		expect(tree.mutationMetrics().collectorFailures).toBe(0);
	},
);

it.each([1, 2, 3])(
	"closes the candidate when EOF scaffolding exceeds %i nodes",
	(maxNodes) => {
		let candidate: DocumentTree | undefined;
		let closed = 0;
		expect(() =>
			parseHtmlDocument("", "https://example.test/", {
				limits: { maxNodes },
				initializeDocument(owner) {
					candidate = owner;
					owner.onClose(() => closed++);
				},
			}),
		).toThrow("node limit");
		expect(closed).toBe(1);
		expect(candidate?.nodeCount).toBe(0);
	},
);

it("lets the startup hook run before a later scaffold quota failure", async () => {
	let count = 0;
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"",
			"https://example.test/",
			{ limits: { maxNodes: 1 } },
			{
				start(owner) {
					candidate = owner;
					count = owner.nodeCount;
				},
				async script() {},
				async finish() {},
			},
		),
	).rejects.toThrow("node limit");
	expect(count).toBe(1);
	expect(candidate?.nodeCount).toBe(0);
});

it.each(["abort", "throw"])(
	"releases an empty candidate after startup %s",
	async (operation) => {
		const controller = new AbortController();
		let candidate: DocumentTree | undefined;
		let before = 0;
		await expect(
			parseHtmlDocumentAsync(
				"<p>unused",
				"https://example.test/",
				{ signal: controller.signal },
				{
					start(owner) {
						candidate = owner;
						before = owner.nodeCount;
						if (operation === "abort") controller.abort();
						else throw new Error("startup failed");
					},
					async script() {},
					async finish() {},
				},
			),
		).rejects.toThrow(operation === "abort" ? "aborted" : "startup failed");
		expect(before).toBe(1);
		expect(candidate?.nodeCount).toBe(0);
	},
);

it.each(["div", "html", "template"])(
	"retains the %s fragment contract without document startup hooks",
	(tagName) => {
		let initialized = false;
		const { tree, fragment } = parseHtmlFragment(
			"<p>text",
			"https://example.test/",
			{ tagName },
			{
				initializeDocument() {
					initialized = true;
				},
			},
		);
		trees.push(tree);
		expect(initialized).toBe(false);
		expect(serializeHtml(tree, fragment)).toBe(
			tagName === "html"
				? "<head></head><body><p>text</p></body>"
				: "<p>text</p>",
		);
		expect(htmlParseInfo(tree)?.mode).toBe("no-quirks");
	},
);

it("updates retained host document getters as parser writes publish the body", async () => {
	const createHostObject = (definition: ScriptHostObjectDefinition) => {
		const host = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(host, name, descriptor);
		Object.assign(host, definition.methods);
		return host;
	};
	let host:
		| { documentElement: unknown; head: unknown; body: unknown }
		| undefined;
	const observed: boolean[][] = [];
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script>tail",
		"https://example.test/",
		{},
		{
			start(owner) {
				host = new ScriptDom(owner, {
					createHostObject,
				}).node(owner.root) as typeof host;
				observed.push([
					host?.documentElement === null,
					host?.head === null,
					host?.body === null,
				]);
			},
			async script(_owner, _id, context) {
				observed.push([
					host?.documentElement !== null,
					host?.head !== null,
					host?.body === null,
				]);
				context.write("<body id=written><p>value");
				observed.push([
					host?.documentElement !== null,
					host?.head !== null,
					host?.body !== null,
				]);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(observed).toEqual(Array.from({ length: 3 }, () => [true, true, true]));
});
