import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { insertAdjacentHtml, setOuterHtml } from "./html-content.js";
import { parseHtmlDocument, parseHtmlFragment } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Node {
	outerHTML: unknown;
	innerHTML: string;
	parentNode: Node | null;
	textContent: string;
	value: string;
	childNodes: Node[];
	insertAdjacentHTML(...args: unknown[]): void;
	getElementById(id: string): Node;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function factory(definition: ScriptHostObjectDefinition) {
	const target = Object.create(null);
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, descriptor);
	Object.assign(target, definition.methods);
	return target;
}
function fixture(
	source = '<main id="parent"><input id="first" value="original"><section id="target"><b id="child">middle</b></section><i id="last">last</i></main>',
) {
	const tree = parseHtmlDocument(source, "https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture target ${selector}`);
		return found;
	};
	const dom = new ScriptDom(tree, { createHostObject: factory });
	return {
		tree,
		dom,
		id,
		get: (selector: string) => dom.node(id(selector)) as Node,
	};
}

it.each([
	[
		"beforebegin",
		'<span id="new">inserted</span><section id="target"><b id="child">middle</b></section>',
	],
	[
		"afterbegin",
		'<section id="target"><span id="new">inserted</span><b id="child">middle</b></section>',
	],
	[
		"beforeend",
		'<section id="target"><b id="child">middle</b><span id="new">inserted</span></section>',
	],
	[
		"afterend",
		'<section id="target"><b id="child">middle</b></section><span id="new">inserted</span>',
	],
])(
	"inserts contextual HTML at %s without replacing surrounding content",
	(position, expected) => {
		const { tree, id, get } = fixture();
		const original = get("#child");
		const first = get("#first");
		first.value = "edited";
		const reference = tree.reference(id("#target"));
		expect(
			get("#target").insertAdjacentHTML(
				position,
				'<span id="new">inserted</span>',
			),
		).toBeUndefined();
		expect(serializeHtml(tree, id("#parent"))).toContain(expected);
		expect(get("#child")).toBe(original);
		expect(get("#first")).toBe(first);
		expect(first.value).toBe("edited");
		expect(tree.resolve(reference).id).toBe(id("#target"));
	},
);

it("accepts ASCII case-insensitive positions but not whitespace or unknown positions", () => {
	const { tree, get } = fixture();
	const target = get("#target");
	target.insertAdjacentHTML("aFtErBeGiN", "one");
	expect(target.textContent).toBe("onemiddle");
	for (const position of [
		" afterbegin",
		"afterbegin ",
		"before",
		"",
		"AFTER\u212AEND",
		"a".repeat(1000),
	]) {
		const before = { revision: tree.revision, count: tree.nodeCount };
		expect(() => target.insertAdjacentHTML(position, "<b>bad</b>")).toThrow(
			"position",
		);
		expect({ revision: tree.revision, count: tree.nodeCount }).toEqual(before);
	}
});

it("outerHTML replaces only its target with fresh nodes and retains the detached old capability", () => {
	const { tree, get, id } = fixture();
	const target = get("#target");
	const child = get("#child");
	const first = get("#first");
	const reference = tree.reference(id("#target"));
	const oldHtml = target.outerHTML;
	target.outerHTML = '<p id="target">new</p>tail<!--marker-->';
	expect(target.outerHTML).toBe(oldHtml);
	expect(target.parentNode).toBeNull();
	expect(child.parentNode).toBe(target);
	expect(get("#target")).not.toBe(target);
	expect(get("#first")).toBe(first);
	expect(serializeHtml(tree, id("#parent"))).toContain(
		'<p id="target">new</p>tail<!--marker--><i',
	);
	expect(() => tree.resolve(reference)).toThrow("no longer");
});

it("outerHTML on a detached element performs no parse or allocation", () => {
	const { tree, dom } = fixture();
	const detached = tree.createElement("div");
	tree.setTextContent(detached, "old");
	const node = dom.node(detached) as Node;
	const count = tree.nodeCount;
	const revision = tree.revision;
	node.outerHTML = "<svg>unsupported parser input";
	expect(tree.nodeCount).toBe(count);
	expect(tree.revision).toBe(revision);
	expect(node.textContent).toBe("old");
});

it("rejects outerHTML and external adjacent insertion on the document element", () => {
	const { tree, get } = fixture();
	const root = get("html");
	const revision = tree.revision;
	for (const source of ["", "<html></html>"]) {
		expect(() => {
			root.outerHTML = source;
		}).toThrow("document root");
		for (const position of ["beforebegin", "afterend"])
			expect(() => root.insertAdjacentHTML(position, source)).toThrow("parent");
	}
	expect(tree.revision).toBe(revision);
});

it("supports internal adjacent insertion into detached elements but rejects external positions", () => {
	const { tree, dom } = fixture();
	const node = dom.node(tree.createElement("section")) as Node;
	node.insertAdjacentHTML("afterbegin", "<b>one</b>");
	node.insertAdjacentHTML("beforeend", "<i>two</i>");
	expect(node.innerHTML).toBe("<b>one</b><i>two</i>");
	expect(() => node.insertAdjacentHTML("beforebegin", "")).toThrow("parent");
	expect(() => node.insertAdjacentHTML("afterend", "")).toThrow("parent");
});

it("uses a body parsing context for fragment-parent outerHTML and adjacent HTML", () => {
	const { tree, dom } = fixture();
	const fragment = tree.createFragment();
	const child = tree.createElement("td");
	tree.append(fragment, child);
	const node = dom.node(child) as Node;
	node.insertAdjacentHTML("beforebegin", "<tr><td>before</td></tr>");
	node.outerHTML = "<tr><td>after</td></tr><strong>end</strong>";
	expect(serializeHtml(tree, fragment)).toBe("beforeafter<strong>end</strong>");
});

it("substitutes body rather than html context for adjacent insertion", () => {
	const { tree, get, id } = fixture();
	const head = get("head");
	const body = get("body");
	get("html").insertAdjacentHTML("afterbegin", "<span>start</span>");
	head.insertAdjacentHTML("afterend", "<p>between</p>");
	expect(
		tree.get(id("html")).children.map((child) => tree.get(child).tagName),
	).toEqual(["span", "head", "p", "body"]);
	expect(get("head")).toBe(head);
	expect(get("body")).toBe(body);
});

it("uses parent contexts for table rows and element contexts for adjacent children", () => {
	const { get } = fixture(
		'<table id="table"><tbody id="body"><tr id="row"><td id="cell">old</td></tr></tbody></table>',
	);
	get("#cell").outerHTML = '<td id="new">new</td><td>next</td>';
	expect(get("#row").innerHTML).toBe('<td id="new">new</td><td>next</td>');
	get("#row").insertAdjacentHTML(
		"afterend",
		'<tr id="next"><td>second</td></tr>',
	);
	get("#table").insertAdjacentHTML(
		"beforeend",
		'<tr id="last"><td>third</td></tr>',
	);
	expect(get("#next").innerHTML).toBe("<td>second</td>");
	expect(get("#table").innerHTML).toContain('<tbody><tr id="last">');
});

it("preserves ancestor-form suppression for both insertion and replacement", () => {
	const { get, tree } = fixture(
		'<form id="form"><div id="target">old</div></form>',
	);
	get("#target").insertAdjacentHTML(
		"beforeend",
		'<form id="nested"><input name="first"></form>',
	);
	get("#target").outerHTML = '<form id="other"><input name="second"></form>';
	expect(serializeHtml(tree)).not.toContain('id="nested"');
	expect(get("#form").innerHTML).toBe('<input name="second">');
});

it("select contexts parse and attach usable options with current native selectedness", () => {
	const { get } = fixture(
		'<select id="select"><option id="old">old</option></select>',
	);
	get("#old").outerHTML =
		'<option id="new" value="next" selected>Next</option>';
	get("#select").insertAdjacentHTML(
		"beforeend",
		'<option value="last">Last</option>',
	);
	expect(get("#select").value).toBe("next");
	expect(get("#select").childNodes).toHaveLength(2);
});

it("raw-text and RCDATA contexts do not accidentally create markup", () => {
	const { get } = fixture(
		'<textarea id="text">old</textarea><style id="style"></style>',
	);
	get("#text").insertAdjacentHTML("afterbegin", "<b>&amp;</b>");
	get("#style").insertAdjacentHTML("beforeend", "<b>&amp;</b>");
	expect(get("#text").textContent).toBe("<b>&</b>old");
	expect(get("#style").textContent).toBe("<b>&amp;</b>");
	expect(
		get("#text").childNodes.every((node) => node.childNodes.length === 0),
	).toBe(true);
});

it.each(["outer", "adjacent"])(
	"%s HTML keeps existing state and allocation unchanged on parse errors",
	(operation) => {
		const { tree, get } = fixture();
		const target = get("#target");
		const before = {
			html: serializeHtml(tree),
			count: tree.nodeCount,
			revision: tree.revision,
		};
		expect(() => {
			if (operation === "outer")
				target.outerHTML = "<b>staged</b><frameset>unsupported";
			else
				target.insertAdjacentHTML(
					"beforebegin",
					"<b>staged</b><frameset>unsupported",
				);
		}).toThrow("not implemented");
		expect({
			html: serializeHtml(tree),
			count: tree.nodeCount,
			revision: tree.revision,
		}).toEqual(before);
	},
);

it.each([{ maxNodes: 4 }, { maxTextCodeUnits: 12 }, { maxDepth: 3 }])(
	"preflights destination quotas for outer and adjacent insertion: %j",
	(limits) => {
		for (const operation of ["outer", "adjacent"] as const) {
			const tree = new DocumentTree("https://example.com/", limits);
			documents.push(tree);
			const parent = tree.createElement("div");
			const target = tree.createElement("p");
			tree.append(tree.root, parent);
			tree.append(parent, target);
			tree.setTextContent(target, "old");
			const state = () => ({
				nodes: [...tree.walk()].map(({ node }) => node),
				count: tree.nodeCount,
				revision: tree.revision,
			});
			const before = state();
			expect(() => {
				if (operation === "outer")
					setOuterHtml(tree, target, "<b><i>new text</i></b>");
				else
					insertAdjacentHtml(
						tree,
						target,
						"beforebegin",
						"<b><i>new text</i></b>",
					);
			}).toThrow("limit");
			expect(state()).toEqual(before);
		}
	},
);

it("supports empty removal and no-op insertion without allocating in a full document", () => {
	const tree = new DocumentTree("https://example.com/", { maxNodes: 3 });
	documents.push(tree);
	const parent = tree.createElement("div");
	const target = tree.createElement("button");
	tree.append(tree.root, parent);
	tree.append(parent, target);
	tree.setActiveElement(target);
	const revision = tree.revision;
	insertAdjacentHtml(tree, target, "beforebegin", "");
	expect(tree.revision).toBe(revision);
	setOuterHtml(tree, target, "");
	expect(tree.nodeCount).toBe(3);
	expect(tree.get(parent).children).toEqual([]);
	expect(tree.activeElement).toBeNull();
});

it("cancellation leaves both outer and adjacent commits unchanged", () => {
	const { tree, id } = fixture();
	const signal = AbortSignal.abort();
	const target = id("#target");
	const before = { count: tree.nodeCount, revision: tree.revision };
	expect(() => setOuterHtml(tree, target, "<b>new</b>", { signal })).toThrow(
		"abort",
	);
	expect(() =>
		insertAdjacentHtml(tree, target, "beforeend", "<b>new</b>", { signal }),
	).toThrow("abort");
	expect({ count: tree.nodeCount, revision: tree.revision }).toEqual(before);
});

it("uses null-to-empty only for outerHTML, while adjacent null and undefined become text", () => {
	const { get } = fixture();
	const target = get("#target");
	target.insertAdjacentHTML("beforeend", null);
	target.insertAdjacentHTML("beforeend", undefined);
	expect(target.textContent).toBe("middlenullundefined");
	get("#last").outerHTML = undefined;
	expect(get("#parent").textContent).toBe("middlenullundefinedundefined");
	target.outerHTML = null;
	expect(get("#parent").textContent).toBe("undefined");
});

it("checks required arguments and rejects coercion hooks without executing them", () => {
	const { tree, get } = fixture();
	const target = get("#target");
	let calls = 0;
	const object = {
		toString() {
			calls++;
			return "<p>bad</p>";
		},
	};
	const revision = tree.revision;
	expect(() => target.insertAdjacentHTML()).toThrow("requires");
	expect(() => target.insertAdjacentHTML("beforeend")).toThrow("requires");
	expect(() => target.insertAdjacentHTML(object, "valid")).toThrow(
		"conversion",
	);
	expect(() => target.insertAdjacentHTML("beforeend", object)).toThrow(
		"conversion",
	);
	expect(() => {
		target.outerHTML = object;
	}).toThrow("conversion");
	expect(tree.revision).toBe(revision);
	expect(calls).toBe(0);
});

it("rejects non-elements and revoked capabilities even for empty insertion", () => {
	const { tree, get } = fixture();
	expect(() => setOuterHtml(tree, tree.root, "")).toThrow("element");
	expect(() => insertAdjacentHtml(tree, tree.root, "beforeend", "")).toThrow(
		"element",
	);
	const target = get("#target");
	tree.close();
	expect(() => {
		target.outerHTML = "";
	}).toThrow("closed");
	expect(() => target.insertAdjacentHTML("beforeend", "")).toThrow("closed");
});

it("validates import references before allocating and retains source fragment identity", () => {
	const { tree, id } = fixture();
	const parsed = parseHtmlFragment("<b>new</b>", tree.url, { tagName: "div" });
	documents.push(parsed.tree);
	const before = { count: tree.nodeCount, revision: tree.revision };
	expect(() =>
		tree.insertChildrenFrom(
			id("#target"),
			parsed.tree,
			parsed.fragment,
			id("#last"),
		),
	).toThrow("reference");
	expect(() =>
		tree.replaceChildFrom(
			id("#target"),
			parsed.tree,
			parsed.fragment,
			id("#last"),
		),
	).toThrow("not a child");
	expect({ count: tree.nodeCount, revision: tree.revision }).toEqual(before);
	tree.insertChildrenFrom(id("#target"), parsed.tree, parsed.fragment);
	expect(parsed.tree.get(parsed.fragment).children).toHaveLength(1);
});
