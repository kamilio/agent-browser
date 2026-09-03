import { afterEach, expect, it } from "vitest";
import {
	documentBody,
	documentElement,
	documentHead,
	setDocumentBody,
} from "./document-elements.js";
import { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";

interface NodeFixture {
	textContent: string;
	parentNode: NodeFixture | null;
	isConnected: boolean;
}
interface DocumentFixture {
	body: NodeFixture | null;
	readonly head: NodeFixture | null;
	readonly documentElement: NodeFixture | null;
	title: string;
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	source:
		| string
		| DocumentTree = "<title>Title</title><body><h1>Old</h1></body>",
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
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture element");
		return found;
	};
	return {
		tree,
		dom,
		queries,
		id,
		document: dom.document as DocumentFixture,
		node: (id: number) => dom.node(id) as NodeFixture,
	};
}

it("returns only direct head/body children of the HTML document element", () => {
	const test = fixture();
	const html = test.id("html");
	const realHead = test.id("head");
	const realBody = test.id("body");
	const wrapper = test.tree.createElement("section");
	const nestedHead = test.tree.createElement("head");
	const nestedBody = test.tree.createElement("body");
	test.tree.append(wrapper, nestedHead);
	test.tree.append(wrapper, nestedBody);
	test.tree.insert(html, wrapper, realHead);
	expect(test.document.head).toBe(test.node(realHead));
	expect(test.document.body).toBe(test.node(realBody));
	test.tree.remove(realHead);
	test.tree.remove(realBody);
	expect(test.document.head).toBeNull();
	expect(test.document.body).toBeNull();
});

it("selects the first body or frameset in direct-child tree order", () => {
	const test = fixture();
	const html = test.id("html");
	const body = test.id("body");
	const frameset = test.tree.createElement("frameset");
	test.tree.insert(html, frameset, body);
	expect(test.document.body).toBe(test.node(frameset));
	test.tree.append(html, frameset);
	expect(test.document.body).toBe(test.node(body));
	test.tree.remove(body);
	expect(test.document.body).toBe(test.node(frameset));
});

it("does not treat an HTML descendant of a different document element as the root", () => {
	const tree = new DocumentTree("https://fixture.invalid/");
	const main = tree.createElement("main");
	const html = tree.createElement("html");
	const head = tree.createElement("head");
	const body = tree.createElement("body");
	tree.append(tree.root, main);
	tree.append(main, html);
	tree.append(html, head);
	tree.append(html, body);
	const test = fixture(tree);
	expect(test.document.documentElement).toBe(test.node(main));
	expect(test.document.head).toBeNull();
	expect(test.document.body).toBeNull();
});

it("replaces the current body with an existing detached body without cloning it", () => {
	const test = fixture();
	const html = test.id("html");
	const oldId = test.id("body");
	const oldBody = test.document.body as NodeFixture;
	const replacement = test.tree.createElement("body", { id: "replacement" });
	const heading = test.tree.createElement("h1");
	test.tree.setTextContent(heading, "New");
	test.tree.append(replacement, heading);
	const replacementObject = test.node(replacement);
	const beforeCount = test.tree.nodeCount;
	test.document.body = replacementObject;
	expect(test.document.body).toBe(replacementObject);
	expect(test.tree.get(replacement).parent).toBe(html);
	expect(test.tree.get(oldId).parent).toBeNull();
	expect(oldBody.textContent).toBe("Old");
	expect(oldBody.isConnected).toBe(false);
	expect(test.tree.nodeCount).toBe(beforeCount);
	expect(test.document.title).toBe("Title");
	expect(extractDocument(test.tree).content).toBe("# New\n");
	expect(renderSnapshot(snapshotDocument(test.tree))).toContain("New");
	expect(renderSnapshot(snapshotDocument(test.tree))).not.toContain("Old");
});

it("preserves surrounding siblings when replacing the body", () => {
	const test = fixture();
	const html = test.id("html");
	const head = test.id("head");
	const comment = test.tree.createComment("after body");
	test.tree.append(html, comment);
	const replacement = test.tree.createElement("body");
	test.document.body = test.node(replacement);
	expect(test.tree.get(html).children).toEqual([head, replacement, comment]);
});

it("treats assignment of the current body as a true no-op", () => {
	const test = fixture();
	const body = test.document.body;
	const before = {
		revision: test.tree.revision,
		count: test.tree.nodeCount,
		html: serializeHtml(test.tree),
	};
	test.document.body = body;
	expect(test.document.body).toBe(body);
	expect({
		revision: test.tree.revision,
		count: test.tree.nodeCount,
		html: serializeHtml(test.tree),
	}).toEqual(before);
});

it.each(["body", "frameset"])(
	"accepts a native %s as the replacement",
	(tagName) => {
		const test = fixture();
		const replacement = test.node(test.tree.createElement(tagName));
		test.document.body = replacement;
		expect(test.document.body).toBe(replacement);
	},
);

it("moves a body from inside the old body without losing its subtree", () => {
	const test = fixture();
	const oldBody = test.id("body");
	const replacement = test.tree.createElement("body");
	test.tree.setTextContent(replacement, "Moved");
	test.tree.append(oldBody, replacement);
	test.document.body = test.node(replacement);
	expect(test.document.body?.textContent).toBe("Moved");
	expect(test.tree.get(oldBody).parent).toBeNull();
	expect(test.tree.get(oldBody).children).not.toContain(replacement);
});

it("appends a body when an HTML root has no current body", () => {
	const test = fixture();
	test.tree.remove(test.id("body"));
	const replacement = test.node(test.tree.createElement("body"));
	test.document.body = replacement;
	expect(test.document.body).toBe(replacement);
	expect(replacement.parentNode).toBe(test.document.documentElement);
});

it("appends to a non-HTML document element while leaving the body getter null", () => {
	const tree = new DocumentTree("https://fixture.invalid/");
	const root = tree.createElement("main");
	tree.append(tree.root, root);
	const test = fixture(tree);
	const body = tree.createElement("body");
	test.document.body = test.node(body);
	expect(tree.get(body).parent).toBe(root);
	expect(test.document.body).toBeNull();
});

it("rejects body assignment without a document element before detaching anything", () => {
	const test = fixture(new DocumentTree("about:blank"));
	const body = test.tree.createElement("body");
	const before = test.tree.revision;
	expect(() => {
		test.document.body = test.node(body);
	}).toThrow();
	expect(test.tree.get(body).parent).toBeNull();
	expect(test.tree.revision).toBe(before);
});

it.each(["div", "head", "html", "p"])(
	"rejects a %s element without changing either tree position",
	(tagName) => {
		const test = fixture();
		const invalid = test.tree.createElement(tagName);
		const before = { body: test.document.body, revision: test.tree.revision };
		expect(() => {
			test.document.body = test.node(invalid);
		}).toThrow();
		expect(test.document.body).toBe(before.body);
		expect(test.tree.revision).toBe(before.revision);
		expect(test.tree.get(invalid).parent).toBeNull();
	},
);

it.each([null, undefined, {}, 7, "body"])(
	"rejects invalid body operands without coercion: %s",
	(value) => {
		const test = fixture();
		const before = test.document.body;
		expect(() => {
			test.document.body = value as NodeFixture | null;
		}).toThrow();
		expect(test.document.body).toBe(before);
	},
);

it("moves a later sibling body into the replaced body's position", () => {
	const test = fixture();
	const html = test.id("html");
	const head = test.id("head");
	const middle = test.tree.createComment("middle");
	const later = test.tree.createElement("body");
	const after = test.tree.createComment("after");
	for (const child of [middle, later, after]) test.tree.append(html, child);
	test.document.body = test.node(later);
	expect(test.tree.get(html).children).toEqual([head, later, middle, after]);
});

it("moves a body out of a fragment without allocating replacement nodes", () => {
	const test = fixture();
	const fragment = test.tree.createFragment();
	const body = test.tree.createElement("body");
	test.tree.append(fragment, body);
	const before = test.tree.nodeCount;
	test.document.body = test.node(body);
	expect(test.tree.get(fragment).children).toEqual([]);
	expect(test.tree.nodeCount).toBe(before);
	expect(test.document.body).toBe(test.node(body));
});

it.each(["text", "comment", "fragment"])(
	"rejects native %s nodes without replacing the body",
	(kind) => {
		const test = fixture();
		const id =
			kind === "text"
				? test.tree.createText("bad")
				: kind === "comment"
					? test.tree.createComment("bad")
					: test.tree.createFragment();
		const previous = test.document.body;
		expect(() => {
			test.document.body = test.node(id);
		}).toThrow("body or frameset");
		expect(test.document.body).toBe(previous);
	},
);

it("rejects foreign document capabilities without changing either owner", () => {
	const first = fixture();
	const second = fixture();
	const firstBody = first.document.body;
	const secondBody = second.document.body;
	const revisions = [first.tree.revision, second.tree.revision];
	expect(() => {
		first.document.body = secondBody;
	}).toThrow("this script document");
	expect(first.document.body).toBe(firstBody);
	expect(second.document.body).toBe(secondBody);
	expect([first.tree.revision, second.tree.revision]).toEqual(revisions);
});

it("preflights depth before moving the new body or clearing existing focus", () => {
	const tree = new DocumentTree("https://fixture.invalid/", { maxDepth: 3 });
	const html = tree.createElement("html");
	const oldBody = tree.createElement("body");
	const focused = tree.createElement("input");
	tree.append(tree.root, html);
	tree.append(html, oldBody);
	tree.append(oldBody, focused);
	tree.setActiveElement(focused);
	const body = tree.createElement("body");
	const section = tree.createElement("section");
	tree.append(body, section);
	tree.append(section, tree.createElement("input"));
	const test = fixture(tree);
	const before = {
		revision: tree.revision,
		count: tree.nodeCount,
		html: serializeHtml(tree),
	};
	expect(() => {
		test.document.body = test.node(body);
	}).toThrow("depth limit");
	expect({
		revision: tree.revision,
		count: tree.nodeCount,
		html: serializeHtml(tree),
	}).toEqual(before);
	expect(tree.get(body).parent).toBeNull();
	expect(tree.activeElement).toBe(focused);
});

it("rejects inserting the document element into itself before mutation", () => {
	const tree = new DocumentTree("https://fixture.invalid/");
	const body = tree.createElement("body");
	tree.append(tree.root, body);
	const test = fixture(tree);
	const before = tree.revision;
	expect(() => {
		test.document.body = test.node(body);
	}).toThrow("cycles");
	expect(tree.revision).toBe(before);
	expect(tree.get(body).parent).toBe(tree.root);
});

it("replaces at the existing node and text quota without allocating a new body", () => {
	const tree = new DocumentTree("https://fixture.invalid/", {
		maxNodes: 4,
		maxTextCodeUnits: 12,
	});
	const html = tree.createElement("html");
	const oldBody = tree.createElement("body");
	const replacement = tree.createElement("body");
	tree.append(tree.root, html);
	tree.append(html, oldBody);
	const test = fixture(tree);
	test.document.body = test.node(replacement);
	expect(tree.nodeCount).toBe(4);
	expect(test.document.body).toBe(test.node(replacement));
});

it("clears native focus when the focused old body subtree is removed", () => {
	const test = fixture("<body><input></body>");
	test.tree.setActiveElement(test.id("input"));
	test.document.body = test.node(test.tree.createElement("body"));
	expect(test.tree.activeElement).toBeNull();
});

it("keeps head and documentElement readonly while body is writable", () => {
	const test = fixture();
	expect(
		Object.getOwnPropertyDescriptor(test.document, "head")?.set,
	).toBeUndefined();
	expect(
		Object.getOwnPropertyDescriptor(test.document, "documentElement")?.set,
	).toBeUndefined();
	expect(
		Object.getOwnPropertyDescriptor(test.document, "body")?.set,
	).toBeTypeOf("function");
});

it("recomputes root ownership after replacement and shares head selection with title creation", () => {
	const test = fixture();
	test.tree.remove(test.id("html"));
	expect(test.document.documentElement).toBeNull();
	expect(test.document.head).toBeNull();
	expect(test.document.body).toBeNull();
	const root = test.tree.createElement("html");
	const head = test.tree.createElement("head");
	test.tree.append(test.tree.root, root);
	test.tree.append(root, head);
	test.document.title = "New root title";
	expect(documentElement(test.tree)).toBe(root);
	expect(documentHead(test.tree)).toBe(head);
	expect(test.document.head).toBe(test.node(head));
	expect(test.document.title).toBe("New root title");
	const body = test.tree.createElement("body");
	setDocumentBody(test.tree, body);
	expect(documentBody(test.tree)).toBe(body);
	expect(test.document.body).toBe(test.node(body));
});

it("revokes structural accessors on closure without affecting another document", () => {
	const first = fixture();
	const second = fixture();
	const body = first.document.body;
	first.tree.close();
	expect(() => first.document.head).toThrow("closed");
	expect(() => first.document.body).toThrow("closed");
	expect(() => first.document.documentElement).toThrow("closed");
	expect(() => {
		first.document.body = body;
	}).toThrow("closed");
	expect(second.document.body).not.toBeNull();
});
