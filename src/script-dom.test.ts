import { expect, it } from "vitest";
import { withDocumentWrite } from "./document-write.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";

interface TestNode {
	write(...values: readonly unknown[]): void;
	writeln(...values: readonly unknown[]): void;
	body: TestNode;
	activeElement: TestNode | null;
	documentElement: TestNode | null;
	ownerDocument: TestNode | null;
	parentNode: TestNode | null;
	firstChild: TestNode | null;
	childNodes: TestNode[];
	textContent: string | null;
	innerHTML: string | null;
	outerHTML: string;
	nodeName: string;
	nodeType: number;
	isConnected: boolean;
	value: string;
	checked: boolean;
	getElementById(id: string): TestNode | null;
	querySelector(selector: string): TestNode | null;
	createElement(name: string): TestNode;
	createTextNode(text: string): TestNode;
	createDocumentFragment(): TestNode;
	cloneNode(deep?: boolean): TestNode;
	getRootNode(): TestNode;
	appendChild(node: TestNode): TestNode;
	removeChild(node: TestNode): TestNode;
	insertBefore(node: TestNode, before: TestNode | null): TestNode;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const result = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(result, name, {
				get: property.get,
				set: property.set,
			});
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		return result;
	},
};

function fixture(
	source = "<h1 id=heading>Before</h1><input id=input value=old>",
) {
	const tree = parseHtmlDocument(source, "https://example.com/page");
	const dom = new ScriptDom(tree, factory);
	return { tree, dom, document: dom.document as TestNode };
}

function required(node: TestNode | null): TestNode {
	if (!node) throw new Error("Missing fixture node");
	return node;
}

it("exposes live native focus identity through readonly document.activeElement", () => {
	const { tree, document } = fixture();
	try {
		const input = required(document.getElementById("input"));
		expect(document.activeElement).toBe(document.body);
		const target = new DocumentQueries(tree).querySelector("#input");
		if (target === null) throw Error("Missing input");
		tree.setActiveElement(target);
		expect(document.activeElement).toBe(input);
		expect(() => {
			document.activeElement = document.body;
		}).toThrow();
		expect("activeElement" in input).toBe(false);
		tree.setActiveElement(null);
		expect(document.activeElement).toBe(document.body);
	} finally {
		tree.close();
	}
});

it("falls back to body and document element after focused nodes are removed", () => {
	const { tree, document } = fixture();
	try {
		const target = new DocumentQueries(tree).querySelector("#input");
		if (target === null) throw Error("Missing input");
		tree.setActiveElement(target);
		tree.remove(target);
		expect(document.activeElement).toBe(document.body);
		const body = new DocumentQueries(tree).querySelector("body");
		if (body === null) throw Error("Missing body");
		tree.remove(body);
		expect(document.activeElement).toBe(document.documentElement);
	} finally {
		tree.close();
	}
});

it("returns null without a document element and revokes activeElement on closure", () => {
	const tree = new DocumentTree("https://fixture.invalid/focus");
	const dom = new ScriptDom(tree, factory);
	const document = dom.document as TestNode;
	expect(document.activeElement).toBeNull();
	dom.close();
	expect(() => document.activeElement).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	tree.close();
});

it("binds innerHTML parsing and live HTML serialization to the owned document", () => {
	const { tree, document } = fixture();
	const old = required(document.getElementById("heading"));
	document.body.innerHTML =
		'<section><button id="generated">one &amp; two</button></section>';
	const button = required(document.getElementById("generated"));
	expect(button.textContent).toBe("one & two");
	expect(old.parentNode).toBeNull();
	expect(old.textContent).toBe("Before");
	expect(document.body.innerHTML).toBe(
		'<section><button id="generated">one &amp; two</button></section>',
	);
	button.setAttribute("title", '"<&>');
	expect(button.outerHTML).toContain('title="&quot;&lt;&amp;&gt;"');
	button.outerHTML = "replacement";
	expect(button.parentNode).toBeNull();
	expect(document.body.innerHTML).toBe("<section>replacement</section>");
	tree.close();
	expect(() => button.innerHTML).toThrow("closed");
});

it("uses null-to-empty innerHTML conversion and rejects unsafe object coercion", () => {
	const { tree, document } = fixture();
	document.body.innerHTML = null;
	expect(document.body.innerHTML).toBe("");
	expect(() => {
		document.body.innerHTML = {} as string;
	}).toThrow();
	expect(document.body.innerHTML).toBe("");
	tree.close();
});

it("does not replace live script DOM children when fragment parsing fails", () => {
	const { tree, document } = fixture();
	const original = required(document.body.firstChild);
	expect(() => {
		document.body.innerHTML = "<b>parsed</b><frameset>unsupported";
	}).toThrow("not implemented");
	expect(document.body.firstChild).toBe(original);
	expect(original.parentNode).toBe(document.body);
	tree.close();
});

it("exposes scoped fragment identity, queries and ordered child transfer", () => {
	const { tree, document } = fixture();
	const fragment = document.createDocumentFragment();
	const button = document.createElement("button");
	button.setAttribute("id", "fragment-child");
	button.textContent = "Fragment button";
	fragment.appendChild(button);
	expect(fragment.nodeType).toBe(11);
	expect(fragment.nodeName).toBe("#document-fragment");
	expect(fragment.ownerDocument).toBe(document);
	expect(fragment.parentNode).toBeNull();
	expect(fragment.isConnected).toBe(false);
	expect(fragment.textContent).toBe("Fragment button");
	expect(fragment.getElementById("fragment-child")).toBe(button);
	expect(fragment.querySelector("button")).toBe(button);
	expect(document.getElementById("fragment-child")).toBeNull();
	expect(document.body.appendChild(fragment)).toBe(fragment);
	expect(fragment.firstChild).toBeNull();
	expect(button.parentNode).toBe(document.body);
	expect(button.isConnected).toBe(true);
	expect(document.getElementById("fragment-child")).toBe(button);
	expect(fragment.getElementById("fragment-child")).toBeNull();
	tree.close();
	expect(() => fragment.cloneNode()).toThrow("closed");
});

it("exposes independent shallow/deep clones without copying host capabilities", () => {
	const { tree, document } = fixture();
	const heading = required(document.getElementById("heading"));
	const shallow = heading.cloneNode();
	const copy = heading.cloneNode(true);
	expect(copy).not.toBe(heading);
	expect(copy.ownerDocument).toBe(document);
	expect(copy.parentNode).toBeNull();
	expect(copy.textContent).toBe("Before");
	expect(shallow.textContent).toBe("");
	copy.textContent = "Changed clone";
	expect(heading.textContent).toBe("Before");
	const fragment = document.createDocumentFragment();
	fragment.appendChild(copy);
	const clonedFragment = fragment.cloneNode(true);
	expect(clonedFragment.nodeType).toBe(11);
	expect(clonedFragment.firstChild).not.toBe(copy);
	expect(clonedFragment.textContent).toBe("Changed clone");
	expect(() => document.cloneNode(true)).toThrow("Document cloning");
	tree.close();
});

it("refuses foreign fragment capabilities before changing either document", () => {
	const first = fixture();
	const second = fixture();
	const foreign = second.document.createDocumentFragment();
	foreign.appendChild(second.document.createTextNode("foreign"));
	expect(() => first.document.body.appendChild(foreign)).toThrow();
	expect(foreign.textContent).toBe("foreign");
	first.tree.close();
	second.tree.close();
});

it("keeps detached radio state and groups within each fragment root", () => {
	const { tree, document } = fixture();
	const fragment = document.createDocumentFragment();
	const first = document.createElement("input");
	first.setAttribute("type", "radio");
	first.setAttribute("name", "group");
	first.checked = true;
	const second = first.cloneNode();
	expect(first.checked).toBe(true);
	expect(second.checked).toBe(true);
	expect(first.getRootNode()).toBe(first);
	fragment.appendChild(first);
	fragment.appendChild(second);
	expect(first.getRootNode()).toBe(fragment);
	expect(second.checked).toBe(true);
	expect(first.checked).toBe(false);
	first.checked = true;
	expect(first.checked).toBe(true);
	expect(second.checked).toBe(false);
	const separate = first.cloneNode();
	separate.checked = false;
	expect(first.checked).toBe(true);
	document.body.appendChild(fragment);
	expect(first.getRootNode()).toBe(document);
	expect(first.checked).toBe(true);
	tree.close();
});

it("validates document child hierarchy before consuming a fragment", () => {
	const { tree, document } = fixture();
	const fragment = document.createDocumentFragment();
	const duplicateRoot = document.createElement("html");
	fragment.appendChild(duplicateRoot);
	expect(() => document.appendChild(fragment)).toThrow("hierarchy");
	expect(fragment.firstChild).toBe(duplicateRoot);
	fragment.removeChild(duplicateRoot);
	const text = document.createTextNode("not a document child");
	fragment.appendChild(text);
	expect(() => document.appendChild(fragment)).toThrow("hierarchy");
	expect(fragment.firstChild).toBe(text);
	const root = required(document.firstChild);
	expect(document.insertBefore(root, root)).toBe(root);
	tree.close();
});

it("grants bounded write/writeln only during an owned parser scope", async () => {
	const { tree, dom, document } = fixture();
	const written: string[] = [];
	try {
		expect(() => document.write("outside")).toThrow();
		await withDocumentWrite(
			tree,
			{
				write: (text) => {
					written.push(text);
				},
			},
			async () => {
				expect(document.write("one", 2, null)).toBeUndefined();
				document.writeln("line", true);
				document.writeln();
				expect(() => document.write({})).toThrow();
				const large = "x".repeat(tree.limits.maxTextCodeUnits);
				expect(() => document.write(large, large)).toThrow();
			},
		);
		expect(written).toEqual(["one2null", "linetrue\n", "\n"]);
		expect(() => document.writeln("outside")).toThrow();
	} finally {
		dom.close();
		tree.close();
	}
});

it("revokes the parser writer on callback failure and document closure", async () => {
	const { tree, dom, document } = fixture();
	const context = { write() {} };
	await expect(
		withDocumentWrite(tree, context, async () => {
			throw new Error("failure");
		}),
	).rejects.toThrow("failure");
	expect(() => document.write("outside")).toThrow();
	await withDocumentWrite(tree, context, async () => {
		tree.close();
		expect(() => document.write("closed")).toThrow();
	});
	dom.close();
});

it("preserves node identity and updates the authoritative snapshot", () => {
	const { tree, dom, document } = fixture();
	try {
		const heading = required(document.getElementById("heading"));
		expect(heading).toBe(document.querySelector("h1"));
		expect(heading.ownerDocument).toBe(document);
		heading.textContent = "After";
		expect(renderSnapshot(snapshotDocument(tree))).toContain("After");
		expect(heading.firstChild?.textContent).toBe("After");
	} finally {
		dom.close();
		tree.close();
	}
});

it("creates, inserts, removes and reattaches actual nodes", () => {
	const { tree, dom, document } = fixture();
	try {
		const paragraph = document.createElement("p");
		const text = document.createTextNode("Created");
		expect(paragraph.appendChild(text)).toBe(text);
		paragraph.setAttribute("id", "created");
		expect(
			document.body.insertBefore(paragraph, document.body.firstChild),
		).toBe(paragraph);
		expect(document.getElementById("created")).toBe(paragraph);
		expect(paragraph.parentNode).toBe(document.body);
		expect(document.body.removeChild(paragraph)).toBe(paragraph);
		expect(paragraph.isConnected).toBe(false);
		expect(document.body.appendChild(paragraph)).toBe(paragraph);
		expect(paragraph.isConnected).toBe(true);
		expect(renderSnapshot(snapshotDocument(tree))).toContain("Created");
	} finally {
		dom.close();
		tree.close();
	}
});

it("reflects attributes and programmatic control values without changing defaults", () => {
	const { tree, dom, document } = fixture(
		"<input id=input disabled readonly value=old><input id=check type=checkbox>",
	);
	try {
		const input = required(document.getElementById("input"));
		input.value = "new\nvalue";
		expect(input.value).toBe("newvalue");
		expect(input.getAttribute("value")).toBe("old");
		input.setAttribute("title", "Title");
		expect(input.getAttribute("title")).toBe("Title");
		const checkbox = required(document.getElementById("check"));
		checkbox.checked = true;
		expect(checkbox.checked).toBe(true);
		expect(checkbox.getAttribute("checked")).toBeNull();
	} finally {
		dom.close();
		tree.close();
	}
});

it("rejects foreign and fabricated nodes without mutating either document", () => {
	const first = fixture();
	const second = fixture();
	try {
		const revision = first.tree.revision;
		expect(() =>
			first.document.body.appendChild(second.document.body),
		).toThrow();
		expect(() => first.document.body.appendChild({} as TestNode)).toThrow();
		expect(first.tree.revision).toBe(revision);
	} finally {
		first.dom.close();
		second.dom.close();
		first.tree.close();
		second.tree.close();
	}
});

it("keeps detached node references but revokes them when the document closes", () => {
	const { tree, dom, document } = fixture();
	const heading = required(document.getElementById("heading"));
	document.body.removeChild(heading);
	heading.textContent = "Detached";
	expect(heading.textContent).toBe("Detached");
	expect(document.getElementById("heading")).toBeNull();
	tree.close();
	expect(() => heading.textContent).toThrow();
	dom.close();
});

it("handles character-data and document textContent separately", () => {
	const { tree, dom, document } = fixture();
	try {
		expect(document.textContent).toBeNull();
		document.textContent = "ignored";
		const text = document.createTextNode("first");
		text.textContent = "second";
		expect(text.nodeType).toBe(3);
		expect(text.nodeName).toBe("#text");
		expect(text.textContent).toBe("second");
	} finally {
		dom.close();
		tree.close();
	}
});

it("preserves old children if text replacement exceeds a document quota", () => {
	const tree = new DocumentTree("https://example.com", { maxNodes: 3 });
	const element = tree.createElement("p");
	const text = tree.createText("old");
	tree.append(tree.root, element);
	tree.append(element, text);
	const dom = new ScriptDom(tree, factory);
	try {
		const node = dom.node(element) as TestNode;
		expect(() => {
			node.textContent = "new";
		}).toThrow();
		expect(node.textContent).toBe("old");
		expect(node.firstChild).toBe(dom.node(text));
	} finally {
		dom.close();
		tree.close();
	}
});
