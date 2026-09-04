import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";

interface ElementView {
	name: unknown;
	open: boolean;
	innerHTML: string;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(
	markup = '<main><details id="first" name="group" open><summary>First</summary><button id="inside">Inside</button></details><details id="second" name="group"><summary>Second</summary><div>More</div></details></main>',
) {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(markup, "https://fixture.invalid/groups");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const result = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(result, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(result, name, { value: method });
			return result;
		},
	});
	const view = (selector: string) => dom.node(id(selector)) as ElementView;
	const open = (target: number) =>
		Object.hasOwn(tree.get(target).attributes, "open");
	return { tree, id, dom, view, open, actions: documentInteractions(tree) };
}

it.each([
	"name='group' open",
	"open name='group'",
	"NAME='group' OPEN='false'",
])(
	"keeps the first parsed open member regardless of attribute order: %s",
	(attributes) => {
		const { tree, open } = fixture(
			`<main><details ${attributes}></details><details ${attributes}></details><details ${attributes}></details></main>`,
		);
		expect(
			[...tree.walk()]
				.filter(({ node }) => node.tagName === "details")
				.map(({ node }) => open(node.id)),
		).toEqual([true, false, false]);
	},
);

it.each([
	"property",
	"attribute",
	"toggle",
	"attribute-node",
	"click",
	"Enter",
	"Space",
])("opening via %s closes the previous member", (path) => {
	const { tree, id, open, view, actions } = fixture();
	const second = id("#second");
	if (path === "property") view("#second").open = true;
	else if (path === "attribute") tree.setAttribute(second, "open", "false");
	else if (path === "toggle") tree.toggleAttribute(second, "open", true);
	else if (path === "attribute-node")
		tree.setAttributeNode(second, tree.createAttribute("open"));
	else if (path === "click")
		actions.click(tree.reference(id("#second summary")));
	else {
		actions.focus.focus(tree.reference(id("#second summary")));
		actions.keyboard.press(path === "Space" ? " " : path);
	}
	expect([open(id("#first")), open(second)]).toEqual([false, true]);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#inside")).width,
	).toBe(0);
	expect(
		snapshotDocument(tree)
			.entries.filter(
				(entry) => entry.role === "button" && entry.expanded !== undefined,
			)
			.map((entry) => entry.expanded),
	).toEqual([false, true]);
});

it.each([
	"property",
	"attribute",
	"attribute-node",
	"attached-attribute-value",
])(
	"renaming via %s closes the joining element, not the existing member",
	(path) => {
		const { tree, id, open, view } = fixture(
			'<main><details id="first" name="group" open></details><details id="second" name="other" open></details></main>',
		);
		const second = id("#second");
		if (path === "property") view("#second").name = "group";
		else if (path === "attribute") tree.setAttribute(second, "name", "group");
		else if (path === "attribute-node")
			tree.setAttributeNode(second, tree.createAttribute("name", "group"));
		else {
			const attribute = tree.getAttributeNode(second, "name");
			if (attribute === null) throw new Error("Missing name");
			tree.setAttributeValue(attribute, "group");
		}
		expect([open(id("#first")), open(second)]).toEqual([true, false]);
		expect(tree.get(second).attributes.name).toBe("group");
	},
);

it.each(["", "Group", " group", "group ", "another"])(
	"keeps group names exact and treats %s separately",
	(name) => {
		const { tree, id, open } = fixture();
		tree.setAttribute(id("#second"), "name", name);
		tree.setAttribute(id("#second"), "open", "");
		expect([open(id("#first")), open(id("#second"))]).toEqual([true, true]);
	},
);

it.each(["", " ", "雪", "__proto__"])(
	"handles matching %s names without trimming or object-key collisions",
	(name) => {
		const { tree, id, open } = fixture();
		tree.setAttribute(id("#first"), "name", name);
		tree.setAttribute(id("#second"), "name", name);
		tree.setAttribute(id("#second"), "open", "");
		expect([open(id("#first")), open(id("#second"))]).toEqual([!name, true]);
	},
);

it("removes empty and missing names from exclusivity without changing open state", () => {
	const { tree, id, open } = fixture();
	tree.removeAttribute(id("#first"), "name");
	tree.setAttribute(id("#second"), "open", "");
	expect([open(id("#first")), open(id("#second"))]).toEqual([true, true]);
	tree.setAttribute(id("#first"), "name", "group");
	expect([open(id("#first")), open(id("#second"))]).toEqual([false, true]);
});

it.each(["element", "wrapper", "fragment"])(
	"closes an incoming open member in a %s without stealing the existing group",
	(kind) => {
		const { tree, id, open } = fixture();
		const incoming = tree.createElement("details", { name: "group", open: "" });
		const root =
			kind === "element"
				? incoming
				: kind === "fragment"
					? tree.createFragment()
					: tree.createElement("section");
		if (root !== incoming) tree.append(root, incoming);
		tree.insert(id("main"), root, id("#first"));
		expect([open(id("#first")), open(incoming)]).toEqual([true, false]);
	},
);

it.each(["detached", "fragment", "template"])(
	"enforces groups within a %s tree without mixing document roots",
	(kind) => {
		const { tree, id, open } = fixture();
		const root =
			kind === "template"
				? tree.createElement("template")
				: kind === "fragment"
					? tree.createFragment()
					: tree.createElement("section");
		const owner =
			kind === "template" ? tree.templateContent(root) : { tree, id: root };
		const first = owner.tree.createElement("details", {
			name: "group",
			open: "",
		});
		const second = owner.tree.createElement("details", {
			name: "group",
			open: "",
		});
		owner.tree.append(owner.id, first);
		owner.tree.append(owner.id, second);
		expect(Object.hasOwn(owner.tree.get(second).attributes, "open")).toBe(
			false,
		);
		owner.tree.setAttribute(second, "open", "");
		expect(Object.hasOwn(owner.tree.get(first).attributes, "open")).toBe(false);
		expect(open(id("#first"))).toBe(true);
	},
);

it("tracks removals and subtree moves across detached roots", () => {
	const { tree, id, open } = fixture();
	const second = id("#second");
	tree.remove(second);
	tree.setAttribute(second, "open", "");
	expect(open(id("#first"))).toBe(true);
	const wrapper = tree.createElement("section");
	tree.append(wrapper, second);
	tree.append(id("main"), wrapper);
	expect(open(second)).toBe(false);
	tree.setAttribute(second, "open", "");
	expect(open(id("#first"))).toBe(false);
});

it.each(["replace", "replaceChildren"])(
	"does not let a removed member close its %s replacement",
	(operation) => {
		const { tree, id, open } = fixture();
		const incoming = tree.createElement("details", { name: "group", open: "" });
		if (operation === "replace")
			tree.replace(id("main"), incoming, id("#first"));
		else tree.replaceChildren(id("main"), incoming);
		expect(open(incoming)).toBe(true);
		const next = tree.createElement("details", { name: "group", open: "" });
		tree.append(id("main"), next);
		expect(open(next)).toBe(false);
	},
);

it("applies insertion and name rules to nested groups and clones", () => {
	const { tree, id, open } = fixture();
	const nested = tree.createElement("details", { name: "group", open: "" });
	tree.append(id("#first"), nested);
	expect(open(nested)).toBe(false);
	tree.setAttribute(nested, "open", "");
	expect(open(id("#first"))).toBe(false);
	const copy = tree.clone(id("main"), true);
	const copiedOpen = [...tree.walk(copy)].find(
		({ node }) => node.tagName === "details" && open(node.id),
	)?.node.id;
	if (copiedOpen === undefined) throw new Error("Missing copied open member");
	tree.append(id("body"), copy);
	expect(open(copiedOpen)).toBe(false);
	expect(open(nested)).toBe(true);
});

it("shares group state with HTML replacement and import", () => {
	const { tree, id, view, open } = fixture();
	view("main").innerHTML =
		'<details id="new-first" name="group" open></details><details id="new-second" name="group" open></details>';
	expect([open(id("#new-first")), open(id("#new-second"))]).toEqual([
		true,
		false,
	]);
	const destination = new DocumentTree("https://fixture.invalid/destination");
	documents.push(destination);
	const copied = destination.copyFrom(tree, id("main"));
	const children = destination.get(copied).children;
	destination.setAttribute(children[1], "open", "");
	expect(Object.hasOwn(destination.get(children[0]).attributes, "open")).toBe(
		false,
	);
	expect(open(id("#new-first"))).toBe(true);
});

it("clears focus in the automatically collapsed member and preserves attached attribute records", () => {
	const { tree, id, actions, open } = fixture();
	const attribute = tree.getAttributeNode(id("#first"), "open");
	if (attribute === null) throw new Error("Missing open attribute");
	actions.focus.focus(tree.reference(id("#inside")));
	tree.setAttribute(id("#second"), "open", "");
	expect(tree.activeElement).toBeNull();
	expect(tree.getAttributeRecord(attribute)).toMatchObject({
		ownerElement: null,
		value: "",
	});
	expect(open(id("#first"))).toBe(false);
});

it("queues the opener before the auto-closed peer with ordered mutation records", async () => {
	const { tree, id, actions } = fixture();
	await vi.runAllTimersAsync();
	const events: unknown[] = [];
	for (const target of [id("#first"), id("#second")])
		actions.events.addEventListener(target, "toggle", (event) =>
			events.push([
				event.target,
				Reflect.get(event, "oldState"),
				Reflect.get(event, "newState"),
			]),
		);
	const mutations: unknown[] = [];
	tree.onMutation((record) =>
		mutations.push([record.target, record.attributeName, record.oldValue]),
	);
	tree.setAttribute(id("#second"), "open", "");
	expect(mutations).toEqual([
		[id("#second"), "open", null],
		[id("#first"), "open", ""],
	]);
	expect(events).toEqual([]);
	await vi.runAllTimersAsync();
	expect(events).toEqual([
		[id("#second"), "closed", "open"],
		[id("#first"), "open", "closed"],
	]);
});

it("publishes exclusive final state to mutation collectors even when they reenter", () => {
	const { tree, id, open } = fixture();
	const third = tree.createElement("details", { name: "group" });
	tree.append(id("main"), third);
	let entered = false;
	const observed: boolean[][] = [];
	tree.onMutation(() => {
		observed.push([open(id("#first")), open(id("#second")), open(third)]);
		if (!entered) {
			entered = true;
			tree.setAttribute(third, "open", "");
		}
	});
	tree.setAttribute(id("#second"), "open", "");
	expect(observed.every((state) => state.filter(Boolean).length === 1)).toBe(
		true,
	);
	expect([open(id("#first")), open(id("#second")), open(third)]).toEqual([
		false,
		false,
		true,
	]);
});

it.each(["property", "attribute-node"])(
	"preflights both notification tasks before %s group activation",
	async (path) => {
		const { tree, id, open, view } = fixture();
		await vi.runAllTimersAsync();
		for (let index = 0; index < 511; index++)
			tree.createElement("details", { open: "" });
		const attribute = tree.createAttribute("open");
		const revision = tree.revision;
		expect(() => {
			if (path === "property") view("#second").open = true;
			else tree.setAttributeNode(id("#second"), attribute);
		}).toThrow(/notification limit/i);
		expect(tree.revision).toBe(revision);
		expect([open(id("#first")), open(id("#second"))]).toEqual([true, false]);
		expect(tree.getAttributeRecord(attribute).ownerElement).toBeNull();
		expect(tree.detailsToggleTasks.metrics().pending).toBe(511);
	},
);

it.each(["insert", "replace", "replaceChildren", "name"])(
	"rejects %s group closure before changing topology or attributes when tasks are exhausted",
	async (operation) => {
		const { tree, id, open } = fixture();
		const incoming = tree.createElement("details", {
			name: operation === "name" ? "other" : "group",
			open: "",
		});
		if (operation === "name") tree.append(id("main"), incoming);
		const busy = tree.createElement("details");
		while (tree.detailsToggleTasks.metrics().scheduled < 4096)
			tree.toggleAttribute(busy, "open");
		await vi.runAllTimersAsync();
		const before = {
			parent: tree.get(incoming).parent,
			children: tree.get(id("main")).children,
			revision: tree.revision,
			name: tree.get(incoming).attributes.name,
		};
		expect(() => {
			if (operation === "insert") tree.append(id("main"), incoming);
			else if (operation === "replace")
				tree.replace(id("main"), incoming, id("#second"));
			else if (operation === "replaceChildren")
				tree.replaceChildren(id("#second"), incoming);
			else tree.setAttribute(incoming, "name", "group");
		}).toThrow(/notification limit/i);
		expect({
			parent: tree.get(incoming).parent,
			children: tree.get(id("main")).children,
			revision: tree.revision,
			name: tree.get(incoming).attributes.name,
		}).toEqual(before);
		expect([open(id("#first")), open(incoming)]).toEqual([true, true]);
	},
);

it.each(["attribute", "attribute-node"])(
	"invalidates the %s opener before change observers read the closed peer",
	(path) => {
		const { tree, id, open } = fixture();
		const first = id("#first");
		const second = id("#second");
		open(first);
		open(second);
		const observed: boolean[][] = [];
		tree.onChange(() => observed.push([open(first), open(second)]));
		if (path === "attribute") tree.setAttribute(second, "open", "");
		else tree.setAttributeNode(second, tree.createAttribute("open"));
		expect(observed.every((state) => !state[0] && state[1])).toBe(true);
	},
);

it("allows a full queue when the automatically closed peer already has a replaceable task", async () => {
	const { tree, id, open } = fixture();
	for (let index = 0; index < 510; index++)
		tree.createElement("details", { open: "" });
	tree.setAttribute(id("#second"), "open", "");
	expect([open(id("#first")), open(id("#second"))]).toEqual([false, true]);
	expect(tree.detailsToggleTasks.metrics().pending).toBe(512);
	await vi.runAllTimersAsync();
	expect(tree.detailsToggleTasks.metrics().pending).toBe(0);
});

it("requires lifetime capacity for both group transition tasks before changing state", async () => {
	const { tree, id, open } = fixture();
	const busy = tree.createElement("details");
	while (tree.detailsToggleTasks.metrics().scheduled < 4095)
		tree.toggleAttribute(busy, "open");
	await vi.runAllTimersAsync();
	const revision = tree.revision;
	expect(() => tree.setAttribute(id("#second"), "open", "")).toThrow(
		/notification limit/i,
	);
	expect([open(id("#first")), open(id("#second"))]).toEqual([true, false]);
	expect(tree.revision).toBe(revision);
	expect(tree.detailsToggleTasks.metrics().scheduled).toBe(4095);
});

it("keeps value-only writes and removed members from affecting later group selections", async () => {
	const { tree, id, open } = fixture();
	await vi.runAllTimersAsync();
	tree.setAttribute(id("#first"), "open", "false");
	expect(tree.detailsToggleTasks.metrics().pending).toBe(0);
	tree.setAttribute(id("#second"), "open", "");
	tree.remove(id("#second"));
	tree.setAttribute(id("#first"), "open", "");
	expect(open(id("#first"))).toBe(true);
	const incoming = tree.createElement("details", { name: "group", open: "" });
	tree.append(id("main"), incoming);
	expect(open(incoming)).toBe(false);
});

it("reflects primitive names and revokes retained accessors", () => {
	const { view, dom, tree, id } = fixture();
	const details = view("#second");
	details.name = 7;
	expect(details.name).toBe("7");
	details.name = null;
	expect(tree.get(id("#second")).attributes.name).toBe("null");
	dom.close();
	expect(() => details.name).toThrow(/closed/i);
});
