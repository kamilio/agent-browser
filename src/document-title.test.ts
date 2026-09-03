import { afterEach, expect, it, vi } from "vitest";
import {
	documentTitle,
	setDocumentTitle,
	titleElementText,
} from "./document-title.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument, parseHtmlDocumentAsync } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface TitleNode {
	title: string;
	text: string;
	textContent: string;
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	source: string | DocumentTree = "<title>Initial</title><p>Visible</p>",
) {
	const tree =
		typeof source === "string"
			? parseHtmlDocument(source, "https://fixture.invalid/")
			: source;
	trees.push(tree);
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const result = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(result, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(result, name, { value: method });
			return Object.preventExtensions(result);
		},
	});
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error("Missing fixture node");
		return result;
	};
	return {
		tree,
		dom,
		queries,
		id,
		document: dom.document as TitleNode,
		node: (id: number) => dom.node(id) as TitleNode,
	};
}

it("exposes a live document title and reflects native mutations in extraction", () => {
	const test = fixture();
	expect(test.document.title).toBe("Initial");
	test.document.title = "  New\n title  ";
	expect(test.document.title).toBe("New title");
	expect(test.tree.textContent(test.id("title"))).toBe("  New\n title  ");
	expect(extractDocument(test.tree).title).toBe("New title");
	test.tree.setTextContent(test.id("title"), "Native update");
	expect(test.document.title).toBe("Native update");
});

it("exposes uncollapsed direct-child title text separately from the advisory title attribute", () => {
	const test = fixture();
	const title = test.node(test.id("title"));
	title.title = "tooltip";
	title.text = " \tRaw\n title ";
	expect(title.text).toBe(" \tRaw\n title ");
	expect(test.document.title).toBe("Raw title");
	expect(title.title).toBe("tooltip");
	expect(test.tree.get(test.id("title")).attributes.title).toBe("tooltip");
});

it("preserves non-ASCII spaces while collapsing only ASCII title whitespace", () => {
	const test = fixture("<title> \tA&nbsp;  B&emsp; \n</title>");
	expect(test.document.title).toBe("A\u00a0 B\u2003");
	expect(extractDocument(test.tree).title).toBe("A\u00a0 B\u2003");
});

it("excludes comments and descendant-element text from title text", () => {
	const test = fixture("<title>First</title>");
	const title = test.id("title");
	const nested = test.tree.createElement("b");
	test.tree.setTextContent(nested, "ignored");
	test.tree.append(title, nested);
	test.tree.append(title, test.tree.createComment("ignored"));
	test.tree.append(title, test.tree.createText(" Last"));
	expect(test.node(title).text).toBe("First Last");
	expect(test.document.title).toBe("First Last");
	expect(extractDocument(test.tree).title).toBe("First Last");
});

it("creates a missing title at the end of the actual head without removing its siblings", () => {
	const test = fixture(
		"<head><meta name=fixture><style>p{color:red}</style></head><body><p>Visible</p>",
	);
	const head = test.id("head");
	const original = [...test.tree.get(head).children];
	expect(test.document.title).toBe("");
	test.document.title = "Created";
	const title = test.id("title");
	expect(test.tree.get(head).children).toEqual([...original, title]);
	expect(test.node(title).text).toBe("Created");
	expect(test.tree.textContent(test.id("p"))).toBe("Visible");
});

it("creates an empty title without adding a text child", () => {
	const test = fixture("<p>Body</p>");
	test.document.title = "";
	expect(test.tree.get(test.id("title")).children).toEqual([]);
	expect(test.document.title).toBe("");
});

it("uses the first title in tree order even if it is empty or outside head", () => {
	const test = fixture("<title>First</title><title>Second</title><p>Body</p>");
	const [first, second] = test.queries.querySelectorAll("title");
	test.node(first).text = "";
	expect(test.document.title).toBe("");
	test.tree.remove(first);
	expect(test.document.title).toBe("Second");
	test.tree.append(test.id("body"), second);
	test.tree.remove(test.id("head"));
	test.document.title = "Outside head";
	expect(test.node(second).text).toBe("Outside head");
	expect(test.node(first).text).toBe("");
});

it("does not invent a head when neither a title nor a valid head exists", () => {
	const test = fixture("<p>Body</p>");
	test.tree.remove(test.id("head"));
	const nestedHead = test.tree.createElement("head");
	test.tree.append(test.id("body"), nestedHead);
	const before = { revision: test.tree.revision, count: test.tree.nodeCount };
	test.document.title = "Ignored";
	expect(test.document.title).toBe("");
	expect(test.queries.querySelector("title")).toBeNull();
	expect({ revision: test.tree.revision, count: test.tree.nodeCount }).toEqual(
		before,
	);
});

it("leaves a document without a document element unchanged", () => {
	const test = fixture(new DocumentTree("about:blank"));
	test.document.title = "Ignored";
	expect(test.document.title).toBe("");
	expect(test.tree.nodeCount).toBe(1);
});

it("replaces all children with literal text and preserves old detached identities", () => {
	const test = fixture();
	const title = test.id("title");
	const old = test.tree.get(title).children[0];
	test.node(title).text = "<script>literal</script>&amp;";
	expect(test.tree.get(old).parent).toBeNull();
	expect(test.tree.get(old).data).toBe("Initial");
	expect(test.tree.get(title).children).toHaveLength(1);
	expect(test.document.title).toBe("<script>literal</script>&amp;");
	expect(test.queries.querySelector("script")).toBeNull();
	expect(serializeHtml(test.tree, title)).toBe(
		"&lt;script&gt;literal&lt;/script&gt;&amp;amp;",
	);
	test.node(title).text = "";
	expect(test.tree.get(title).children).toEqual([]);
});

it.each([null, undefined, true, false, 0, 123, Number.NaN, 5n])(
	"uses existing primitive DOM string conversion for %s",
	(value) => {
		const test = fixture();
		test.document.title = value as unknown as string;
		expect(test.document.title).toBe(String(value));
		test.node(test.id("title")).text = value as unknown as string;
		expect(test.node(test.id("title")).text).toBe(String(value));
	},
);

it("rejects unsupported coercion before mutation or user object hooks", () => {
	const test = fixture();
	const convert = vi.fn(() => "bad");
	const value = { toString: convert } as unknown as string;
	expect(() => {
		test.document.title = value;
	}).toThrow("conversion");
	expect(() => {
		test.node(test.id("title")).text = value;
	}).toThrow("conversion");
	expect(convert).not.toHaveBeenCalled();
	expect(test.document.title).toBe("Initial");
});

it("revokes title getters and setters after document closure", () => {
	const test = fixture();
	const title = test.node(test.id("title"));
	test.tree.close();
	expect(() => test.document.title).toThrow("closed");
	expect(() => {
		test.document.title = "late";
	}).toThrow("closed");
	expect(() => title.text).toThrow("closed");
	expect(() => {
		title.text = "late";
	}).toThrow("closed");
});

it.each([
	{ maxNodes: 5 },
	{ maxTextCodeUnits: 15 },
	{ maxDepth: 2 },
] as Partial<DocumentLimits>[])(
	"leaves the live document unchanged when title creation exceeds %j",
	(limits) => {
		const tree = new DocumentTree("https://fixture.invalid/", limits);
		const html = tree.createElement("html");
		const head = tree.createElement("head");
		tree.append(tree.root, html);
		tree.append(html, head);
		const test = fixture(tree);
		const before = {
			count: tree.nodeCount,
			revision: tree.revision,
			html: serializeHtml(tree, tree.root, { maxCodeUnits: 1000 }),
		};
		expect(() => {
			test.document.title = "new";
		}).toThrow("limit");
		expect({
			count: tree.nodeCount,
			revision: tree.revision,
			html: serializeHtml(tree, tree.root, { maxCodeUnits: 1000 }),
		}).toEqual(before);
		expect(test.document.title).toBe("");
	},
);

it.each([
	{ maxNodes: 3 },
	{ maxTextCodeUnits: 12 },
] as Partial<DocumentLimits>[])(
	"preserves an existing title and its nodes when replacement exceeds %j",
	(limits) => {
		const tree = new DocumentTree("https://fixture.invalid/", limits);
		const title = tree.createElement("title");
		tree.setTextContent(title, "old");
		tree.append(tree.root, title);
		const test = fixture(tree);
		const before = {
			count: tree.nodeCount,
			revision: tree.revision,
			children: tree.get(title).children,
		};
		for (const write of [
			() => {
				test.document.title = "too long";
			},
			() => {
				test.node(title).text = "too long";
			},
		]) {
			expect(write).toThrow("limit");
			expect(test.document.title).toBe("old");
			expect({
				count: tree.nodeCount,
				revision: tree.revision,
				children: tree.get(title).children,
			}).toEqual(before);
		}
	},
);

it("uses the existing bounded fragment import when creating a title", () => {
	const tree = new DocumentTree("https://fixture.invalid/", {
		maxNodes: 6,
		maxTextCodeUnits: 16,
		maxDepth: 4,
	});
	const html = tree.createElement("html");
	const head = tree.createElement("head");
	tree.append(tree.root, html);
	tree.append(html, head);
	const test = fixture(tree);
	test.document.title = "new";
	expect(test.document.title).toBe("new");
	expect(tree.nodeCount).toBe(6);
	expect(tree.get(head).children).toHaveLength(1);
});

it("keeps document title metadata scoped to the document rather than the extracted subtree", () => {
	const test = fixture("<title>Document</title><main>Content</main>");
	const root = test.tree.reference(test.id("main"));
	test.document.title = "  Revised\t title  ";
	for (const format of ["markdown", "json"] as const)
		expect(extractDocument(test.tree, { root, format }).title).toBe(
			"Revised title",
		);
});

it("preserves raw DOM title controls but escapes them at the extraction boundary", () => {
	const test = fixture();
	test.document.title = "\tA\f B\x1b C\u200e";
	expect(test.document.title).toBe("A B\x1b C\u200e");
	expect(extractDocument(test.tree).title).toBe("A B\\u{1b} C\\u{200e}");
	test.document.title = "x".repeat(1000);
	expect(() => extractDocument(test.tree, { maxBytes: 256 })).toThrow(
		"metadata limit",
	);
});

it("keeps detached title capabilities independent until they enter tree order", () => {
	const test = fixture();
	const detached = test.tree.createElement("title");
	const capability = test.node(detached);
	capability.text = "Detached";
	expect(test.document.title).toBe("Initial");
	test.tree.insert(test.id("head"), detached, test.id("title"));
	expect(test.document.title).toBe("Detached");
	test.tree.remove(detached);
	expect(capability.text).toBe("Detached");
	expect(test.document.title).toBe("Initial");
});

it("does not grant title text setters to ordinary elements or fragments", () => {
	const test = fixture();
	expect(Object.hasOwn(test.node(test.id("p")), "text")).toBe(false);
	expect(Object.hasOwn(test.node(test.tree.createFragment()), "text")).toBe(
		false,
	);
	expect(() => titleElementText(test.tree, test.id("p"))).toThrow(
		"title element",
	);
	expect(() => setDocumentTitle(test.tree, {} as string)).toThrow("title text");
});

it("does not share title owners between documents", () => {
	const first = fixture();
	const second = fixture();
	first.document.title = "First";
	second.document.title = "Second";
	expect(documentTitle(first.tree)).toBe("First");
	expect(documentTitle(second.tree)).toBe("Second");
	first.tree.close();
	expect(documentTitle(second.tree)).toBe("Second");
});

it("updates the native title during parser script hooks without a separate metadata copy", async () => {
	let document!: TitleNode;
	const tree = await parseHtmlDocumentAsync(
		"<title>Before</title><script>change</script><p>After</p>",
		"https://fixture.invalid/",
		{},
		{
			start(tree) {
				document = fixture(tree).document;
			},
			async script() {
				document.title = "During parsing";
			},
			async finish() {},
		},
	);
	expect(document.title).toBe("During parsing");
	expect(extractDocument(tree).title).toBe("During parsing");
});
