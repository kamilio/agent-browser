import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { scriptMutationLimits } from "./script-mutations.js";

interface Node {
	parentNode: Node | null;
	childNodes: Node[];
	firstChild: Node | null;
	textContent: string;
	nodeType: number;
	id: string;
	body: Node;
	documentElement: Node;
	value: string;
	selectedIndex: number;
	append(...values: unknown[]): void;
	prepend(...values: unknown[]): void;
	replaceChildren(...values: unknown[]): void;
	before(...values: unknown[]): void;
	after(...values: unknown[]): void;
	replaceWith(...values: unknown[]): void;
	remove(): void;
	appendChild(child: Node): Node;
	replaceChild(child: Node, previous: Node): Node;
	createElement(tag: string): Node;
	createTextNode(text: string): Node;
	createComment(text: string): Node;
	createDocumentFragment(): Node;
	getElementById(id: string): Node;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function factory(definition: ScriptHostObjectDefinition) {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, property);
	Object.assign(target, definition.methods);
	return target;
}
function fixture() {
	const tree = parseHtmlDocument(
		'<main id="parent"><i id="first">A</i><i id="middle">B</i><i id="last">C</i></main>',
		"https://example.com/",
	);
	documents.push(tree);
	const dom = new ScriptDom(tree, { createHostObject: factory });
	const document = dom.document as Node;
	const get = (id: string) => document.getElementById(id);
	return {
		tree,
		dom,
		document,
		parent: get("parent"),
		first: get("first"),
		middle: get("middle"),
		last: get("last"),
	};
}

it("appends and prepends nodes and primitive strings without parsing markup", () => {
	const { document, parent } = fixture();
	const marker = document.createComment("marker");
	expect(
		parent.append("<b>raw</b>", null, undefined, false, 17, marker),
	).toBeUndefined();
	parent.prepend("start", document.createTextNode(" "));
	expect(parent.textContent).toBe("start ABC<b>raw</b>nullundefinedfalse17");
	expect(parent.childNodes.at(-1)).toBe(marker);
	expect(marker.parentNode).toBe(parent);
});

it("moves repeated nodes to their last argument position", () => {
	const { parent, first, middle, last } = fixture();
	parent.append(first, middle, first);
	expect(parent.childNodes).toEqual([last, middle, first]);
	parent.prepend(first, last, first);
	expect(parent.childNodes).toEqual([last, first, middle]);
});

it("flattens fragments without copying nodes or coalescing text", () => {
	const { document, parent, first } = fixture();
	const fragment = document.createDocumentFragment();
	fragment.append(first, "x", "y");
	parent.prepend(fragment, "z", fragment);
	expect(fragment.childNodes).toEqual([]);
	expect(parent.firstChild).toBe(first);
	expect(parent.childNodes.slice(0, 4).map((node) => node.textContent)).toEqual(
		["A", "x", "y", "z"],
	);
});

it("replaces children with existing descendants and detaches all old siblings", () => {
	const { parent, first, middle, last } = fixture();
	const text = middle.firstChild;
	parent.replaceChildren(last, text, first);
	expect(parent.childNodes).toEqual([last, text, first]);
	expect(middle.parentNode).toBeNull();
	expect(middle.childNodes).toEqual([]);
	expect(parent.textContent).toBe("CBA");
	parent.replaceChildren();
	expect(parent.childNodes).toEqual([]);
	expect(first.parentNode).toBeNull();
});

it.each(["before", "after", "replaceWith"] as const)(
	"%s handles the target among repeated arguments",
	(operation) => {
		const { parent, first, middle, last } = fixture();
		middle[operation](middle, first, middle, last);
		expect(parent.childNodes).toEqual([first, middle, last]);
	},
);

it("before uses the nearest previous sibling not moved by the arguments", () => {
	const { parent, first, middle, last } = fixture();
	last.before(middle, "x", first);
	expect(parent.childNodes).toEqual([
		middle,
		parent.childNodes[1],
		first,
		last,
	]);
	expect(parent.textContent).toBe("BxAC");
});

it("after skips following siblings that are themselves being moved", () => {
	const { parent, first, middle, last } = fixture();
	first.after(last, middle, "x");
	expect(parent.childNodes.slice(0, 3)).toEqual([first, last, middle]);
	expect(parent.textContent).toBe("ACBx");
});

it("replaceWith can move both following siblings and remove its target", () => {
	const { parent, first, middle, last } = fixture();
	first.replaceWith(last, middle);
	expect(parent.childNodes).toEqual([last, middle]);
	expect(first.parentNode).toBeNull();
});

it.each(["before", "after", "replaceWith"] as const)(
	"detached %s validates values but does not allocate or move nodes",
	(operation) => {
		const { tree, document, first, parent } = fixture();
		const detached = document.createElement("aside");
		const revision = tree.revision;
		detached[operation](first, "not created");
		expect(first.parentNode).toBe(parent);
		expect(tree.revision).toBe(revision);
		expect(() => detached[operation]({})).toThrow("Expected a node");
	},
);

it("empty append/prepend/before/after are no-ops; empty replaceWith removes", () => {
	const { tree, parent, middle } = fixture();
	const revision = tree.revision;
	parent.append();
	parent.prepend();
	middle.before();
	middle.after();
	expect(tree.revision).toBe(revision);
	middle.replaceWith();
	expect(middle.parentNode).toBeNull();
	expect(parent.textContent).toBe("AC");
});

it("exposes ChildNode operations on text and comments, but not documents or fragments", () => {
	const { document, parent, first } = fixture();
	const text = first.firstChild as Node;
	text.after("x");
	text.before("y");
	expect(first.textContent).toBe("yAx");
	text.replaceWith("z");
	expect(first.textContent).toBe("yzx");
	const comment = document.createComment("comment");
	parent.append(comment);
	comment.remove();
	expect(comment.parentNode).toBeNull();
	expect(document.remove).toBeUndefined();
	expect(document.createDocumentFragment().before).toBeUndefined();
	expect(text.append).toBeUndefined();
});

it.each(["first", "middle", "last"] as const)(
	"replaceChild moves the %s sibling and returns the detached old node",
	(source) => {
		const fixtureValue = fixture();
		const { parent, middle } = fixtureValue;
		const child = fixtureValue[source];
		expect(parent.replaceChild(child, middle)).toBe(middle);
		expect(parent.childNodes.filter((entry) => entry === child)).toHaveLength(
			1,
		);
		expect(parent.textContent).toBe(
			source === "first" ? "AC" : source === "last" ? "AC" : "ABC",
		);
		if (source !== "middle") expect(middle.parentNode).toBeNull();
	},
);

it("replaceChild consumes fragments and can replace with an empty fragment", () => {
	const { document, parent, first, middle, last } = fixture();
	const fragment = document.createDocumentFragment();
	fragment.append("one", "two");
	expect(parent.replaceChild(fragment, middle)).toBe(middle);
	expect(parent.textContent).toBe("AonetwoC");
	expect(fragment.childNodes).toEqual([]);
	parent.replaceChild(fragment, first);
	expect(parent.textContent).toBe("onetwoC");
	expect(parent.childNodes.at(-1)).toBe(last);
});

it("replacement validation leaves the old child and incoming fragment intact", () => {
	const { tree, document, parent, middle } = fixture();
	const fragment = document.createDocumentFragment();
	fragment.append(document.createElement("aside"));
	const revision = tree.revision;
	expect(() => middle.replaceChild(fragment, parent)).toThrow("reference");
	expect(tree.revision).toBe(revision);
	expect(fragment.childNodes).toHaveLength(1);
	expect(() => parent.replaceChild(parent, middle)).toThrow("cycles");
	expect(middle.parentNode).toBe(parent);
});

it("document replacement excludes removed roots but still forbids multiple elements and text", () => {
	const { document } = fixture();
	const oldRoot = document.documentElement;
	const newRoot = document.createElement("html");
	expect(document.replaceChild(newRoot, oldRoot)).toBe(oldRoot);
	expect(document.documentElement).toBe(newRoot);
	const next = document.createElement("html");
	document.replaceChildren(next);
	expect(document.documentElement).toBe(next);
	const fragment = document.createDocumentFragment();
	fragment.append(document.createElement("one"), document.createElement("two"));
	expect(() => document.replaceChild(fragment, next)).toThrow("hierarchy");
	expect(fragment.childNodes).toHaveLength(2);
	expect(next.parentNode).toBe(document);
	expect(() => document.replaceChildren("text")).toThrow("hierarchy");
	expect(document.documentElement).toBe(next);
	document.replaceChildren();
	expect(document.documentElement).toBeNull();
});

it("conversion can detach arguments before a later hierarchy failure, without destroying the parent", () => {
	const { document, parent, first } = fixture();
	expect(() => parent.append(first, document)).toThrow("Invalid tree parent");
	expect(first.parentNode?.nodeType).toBe(11);
	expect(parent.textContent).toBe("BC");
	expect(parent.parentNode).toBe(document.body);
});

it("rejects foreign nodes, fabricated objects and coercion hooks before moving arguments", () => {
	const { tree, parent, first } = fixture();
	const other = fixture();
	let calls = 0;
	const revision = tree.revision;
	for (const bad of [
		other.first,
		{},
		{
			toString() {
				calls++;
				return "bad";
			},
		},
		Symbol("bad"),
		() => "bad",
	])
		expect(() => parent.append(first, bad)).toThrow();
	expect(calls).toBe(0);
	expect(tree.revision).toBe(revision);
	expect(first.parentNode).toBe(parent);
});

it("bounds argument counts before allocation or mutation", () => {
	const { tree, parent, first } = fixture();
	const revision = tree.revision;
	expect(() =>
		parent.append(...Array(scriptMutationLimits.maxArguments + 1).fill(first)),
	).toThrow("argument limit");
	expect(tree.revision).toBe(revision);
	parent.append(...Array(scriptMutationLimits.maxArguments).fill(first));
	expect(parent.childNodes.at(-1)).toBe(first);
	expect(parent.childNodes).toHaveLength(3);
});

it("clears focus on removed content and preserves surviving node references", () => {
	const { tree, parent, first, middle } = fixture();
	const firstId = [...tree.walk()].find(
		({ node }) => node.attributes.id === "first",
	)?.node.id as number;
	const reference = tree.reference(firstId);
	tree.setActiveElement(firstId);
	parent.replaceChildren(middle);
	expect(tree.activeElement).toBeNull();
	parent.append(first);
	expect(tree.resolve(reference).id).toBe(firstId);
});

it("replacement uses native option-removal fallback rather than restoring a stale select value", () => {
	const { document, parent } = fixture();
	const select = document.createElement("select");
	const first = document.createElement("option");
	const second = document.createElement("option");
	first.textContent = "first";
	second.textContent = "second";
	select.append(first, second);
	parent.append(select);
	select.value = "second";
	select.replaceChildren(second, first);
	expect(select.value).toBe("first");
	expect(select.selectedIndex).toBe(1);
	expect(select.childNodes).toEqual([second, first]);
});

it("replaceChild can promote a descendant without cloning it", () => {
	const { parent, middle } = fixture();
	const text = middle.firstChild as Node;
	expect(parent.replaceChild(text, middle)).toBe(middle);
	expect(text.parentNode).toBe(parent);
	expect(middle.childNodes).toEqual([]);
	expect(parent.textContent).toBe("ABC");
});

it("single ancestor arguments are rejected before clearing existing children", () => {
	const { tree, parent, middle } = fixture();
	const revision = tree.revision;
	expect(() => middle.replaceChildren(parent)).toThrow("cycles");
	expect(() => parent.replaceChildren(parent)).toThrow("cycles");
	expect(tree.revision).toBe(revision);
	expect(parent.textContent).toBe("ABC");
});

it("node and text quotas leave existing replacement content attached", () => {
	for (const limits of [{ maxNodes: 3 }, { maxTextCodeUnits: 8 }]) {
		const tree = new DocumentTree("https://example.com/", limits);
		documents.push(tree);
		const parent = tree.createElement("p");
		const old = tree.createText("old");
		tree.append(tree.root, parent);
		tree.append(parent, old);
		const dom = new ScriptDom(tree, { createHostObject: factory });
		const capability = dom.node(parent) as Node;
		expect(() => capability.replaceChildren("too much new text")).toThrow(
			"limit",
		);
		expect(tree.get(parent).children).toEqual([old]);
		expect(capability.textContent).toBe("old");
	}
});

it("preflights replacement depth before removing existing content", () => {
	const tree = new DocumentTree("https://example.com/", { maxDepth: 3 });
	documents.push(tree);
	const parent = tree.createElement("main");
	const target = tree.createElement("section");
	const old = tree.createText("old");
	const fragment = tree.createFragment();
	const outer = tree.createElement("div");
	tree.append(outer, tree.createText("too deep"));
	tree.append(fragment, outer);
	tree.append(tree.root, parent);
	tree.append(parent, target);
	tree.append(target, old);
	const revision = tree.revision;
	expect(() => tree.replace(target, fragment, old)).toThrow("depth limit");
	expect(() => tree.replaceChildren(target, fragment)).toThrow("depth limit");
	expect(tree.revision).toBe(revision);
	expect(tree.get(target).children).toEqual([old]);
	expect(tree.get(fragment).children).toEqual([outer]);
});

it("closed owners reject even no-argument and detached operations", () => {
	const { dom, parent, first } = fixture();
	first.remove();
	dom.close();
	for (const operation of [
		() => parent.append(),
		() => parent.replaceChildren(),
		() => first.before(),
		() => first.remove(),
		() => parent.replaceChild(first, first),
	])
		expect(operation).toThrow("closed");
});

it("matches an independent marker model for repeated overlapping sibling moves", () => {
	const combinations: string[][] = [[]];
	for (let length = 1; length <= 4; length++)
		for (const previous of combinations.filter(
			(args) => args.length === length - 1,
		))
			for (const name of ["first", "middle", "last"])
				combinations.push([...previous, name]);
	for (const operation of [
		"append",
		"prepend",
		"before",
		"after",
		"replaceWith",
		"replaceChildren",
	] as const)
		for (const args of combinations) {
			const { tree, document, parent, middle } = fixture();
			const staged: string[] = [];
			let expected = ["first", "middle", "last"];
			const markerPosition =
				operation === "prepend"
					? 0
					: operation === "before"
						? 1
						: operation === "after" || operation === "replaceWith"
							? 2
							: 3;
			expected.splice(markerPosition, 0, "marker");
			for (const name of args) {
				expected = expected.filter((entry) => entry !== name);
				const earlier = staged.indexOf(name);
				if (earlier !== -1) staged.splice(earlier, 1);
				staged.push(name);
			}
			if (operation === "replaceWith")
				expected = expected.filter((entry) => entry !== "middle");
			if (operation === "replaceChildren") expected = ["marker"];
			expected.splice(expected.indexOf("marker"), 1, ...staged);
			const receiver =
				operation === "append" ||
				operation === "prepend" ||
				operation === "replaceChildren"
					? parent
					: middle;
			receiver[operation](...args.map((name) => document.getElementById(name)));
			expect(
				parent.childNodes.map((node) => node.id),
				`${operation}(${args.join(",")})`,
			).toEqual(expected);
			tree.close();
		}
});
