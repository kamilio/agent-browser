import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScrollPosition } from "./document-scroll.js";
import { controlledEventListener } from "./events.js";
import { focusTabIndex } from "./focus.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import {
	diffSnapshots,
	snapshotDocument,
	snapshotElementRole,
} from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";

interface TestNode {
	open: unknown;
	tabIndex: number;
	getElementById(id: string): TestNode;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
	removeAttribute(name: string): void;
}
const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function factory(definition: ScriptHostObjectDefinition): object {
	const object = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(object, name, { value: method });
	return Object.preventExtensions(object);
}
function fixture(
	content = '<details id="details"><summary id="summary"><span id="caption">More</span></summary><div id="content"><button id="button">Inside</button></div></details><button id="outside">Outside</button>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}details,summary,div,button{display:block}summary,button{width:60px;height:12px;background:blue}#content{width:60px;height:24px;background:red}${css}</style>${content}`,
		"https://fixture.invalid/details-core",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error("Missing disclosure fixture node");
		return result;
	};
	const actions = documentInteractions(tree);
	const dom = new ScriptDom(tree, { createHostObject: factory });
	return {
		tree,
		queries,
		id,
		actions,
		dom,
		document: dom.document as TestNode,
	};
}

it("collapses content in layout, hit testing, snapshots and focus without removing DOM nodes", () => {
	const { tree, id, actions, queries } = fixture();
	expect(documentStyles(tree).get(id("#summary")).displayed).toBe(true);
	expect(documentStyles(tree).get(id("#content")).display).toBe("block");
	expect(documentStyles(tree).get(id("#content")).displayed).toBe(false);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#content")).width,
	).toBe(0);
	expect(queries.querySelector("#button")).toBe(id("#button"));
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.name === "Inside"),
	).toBe(false);
	expect(documentHitTesting(tree).elementFromPoint(2, 14)).toBe(id("#outside"));
	expect(focusTabIndex(tree, id("#button"))).toBeNull();
	expect(() => actions.click(tree.reference(id("#button")))).toThrow(/hidden/i);
	expect(() =>
		rasterizeDocument(tree, { element: tree.reference(id("#content")) }),
	).toThrow(/visible/i);
});

it.each(["#summary", "#caption"])(
	"toggles a disclosure through native clicks on %s",
	(selector) => {
		const { tree, actions, id } = fixture();
		const reference = tree.reference(id(selector));
		actions.click(reference);
		expect(tree.get(id("#details")).attributes.open).toBe("");
		expect(documentStyles(tree).get(id("#content")).displayed).toBe(true);
		expect(documentHitTesting(tree).elementFromPoint(2, 14)).toBe(
			id("#button"),
		);
		actions.click(reference);
		expect(tree.get(id("#details")).attributes.open).toBeUndefined();
		expect(documentStyles(tree).get(id("#content")).displayed).toBe(false);
	},
);

it("uses the first summary child even when it is not the first element child", () => {
	const { tree, id, actions } = fixture(
		'<details id="details"><div id="before">Hidden</div><!-- gap --><summary id="first">First</summary><summary id="second">Second</summary></details>',
	);
	expect(documentStyles(tree).get(id("#before")).displayed).toBe(false);
	expect(documentStyles(tree).get(id("#first")).displayed).toBe(true);
	expect(documentStyles(tree).get(id("#second")).displayed).toBe(false);
	expect(focusTabIndex(tree, id("#first"))).toBe(0);
	actions.click(tree.reference(id("#first")));
	expect(documentStyles(tree).get(id("#second")).displayed).toBe(true);
	expect(focusTabIndex(tree, id("#second"))).toBeNull();
	actions.click(tree.reference(id("#second")));
	expect(tree.get(id("#details")).attributes.open).toBe("");
});

it("updates summary identity and collapsed branches after reordering", () => {
	const { tree, id, actions } = fixture(
		'<details id="details"><summary id="first">First</summary><summary id="second">Second</summary></details>',
	);
	expect(focusTabIndex(tree, id("#first"))).toBe(0);
	tree.insert(id("#details"), id("#second"), id("#first"));
	expect(documentStyles(tree).get(id("#first")).displayed).toBe(false);
	expect(documentStyles(tree).get(id("#second")).displayed).toBe(true);
	expect(focusTabIndex(tree, id("#second"))).toBe(0);
	actions.click(tree.reference(id("#second")));
	expect(tree.get(id("#details")).attributes.open).toBe("");
});

it.each(["element", "fragment"])(
	"clears focus when %s insertion replaces the visible summary",
	(kind) => {
		const { tree, id, actions } = fixture();
		const previous = id("#summary");
		actions.focus.focus(tree.reference(previous));
		const next = tree.createElement("summary");
		const inserted = kind === "fragment" ? tree.createFragment() : next;
		if (kind === "fragment") tree.append(inserted, next);
		tree.insert(id("#details"), inserted, previous);
		expect(tree.activeElement).toBeNull();
		expect(documentStyles(tree).get(previous).displayed).toBe(false);
		expect(focusTabIndex(tree, next)).toBe(0);
	},
);

it("respects canceled clicks and revalidates summary ownership after listeners", () => {
	const { tree, id, actions } = fixture();
	const summary = id("#summary");
	actions.events.addEventListener(
		summary,
		"click",
		(event) => event.preventDefault(),
		{ once: true },
	);
	actions.click(tree.reference(summary));
	expect(tree.get(id("#details")).attributes.open).toBeUndefined();
	actions.events.addEventListener(
		summary,
		"click",
		() => tree.remove(summary),
		{ once: true },
	);
	actions.click(tree.reference(summary));
	expect(tree.get(id("#details")).attributes.open).toBeUndefined();
});

it.each(["button", "input", "select", "textarea", "a"])(
	"does not toggle details for interactive %s descendants of its summary",
	(tag) => {
		const extra =
			tag === "a"
				? ' href="#target"'
				: tag === "button"
					? ' type="button"'
					: "";
		const { tree, id, actions } = fixture(
			`<details id="details"><summary id="summary">More<${tag} id="interactive"${extra}></${tag}></summary><div>Hidden</div></details>`,
		);
		actions.click(tree.reference(id("#interactive")));
		expect(tree.get(id("#details")).attributes.open).toBeUndefined();
		actions.click(tree.reference(id("#summary")));
		expect(tree.get(id("#details")).attributes.open).toBe("");
	},
);

it("toggles detached primary summaries only through programmatic activation", () => {
	const { tree, id, actions } = fixture();
	const details = id("#details");
	const summary = id("#summary");
	tree.remove(details);
	actions.programmaticClick(summary);
	expect(tree.get(details).attributes.open).toBe("");
	actions.programmaticClick(summary);
	expect(tree.get(details).attributes.open).toBeUndefined();
});

it("supports Enter and held Space without scrolling the document", () => {
	const { tree, id, actions } = fixture(undefined, "body{height:500px}");
	expect(actions.focus.move()).toBe(id("#summary"));
	actions.keyboard.press("Enter");
	expect(tree.get(id("#details")).attributes.open).toBe("");
	actions.keyboard.down("Space");
	expect(tree.keyboardActiveElement).toBe(id("#summary"));
	expect(tree.get(id("#details")).attributes.open).toBe("");
	actions.keyboard.up("Space");
	expect(tree.get(id("#details")).attributes.open).toBeUndefined();
	expect(documentScrollPosition(tree)).toEqual({ x: 0, y: 0 });
	expect(actions.focus.move()).toBe(id("#outside"));
});

it.each(["keydown", "keyup", "click"])(
	"honors canceled %s during summary keyboard activation",
	(type) => {
		const { tree, actions, id } = fixture();
		const summary = id("#summary");
		actions.focus.focus(tree.reference(summary));
		actions.events.addEventListener(
			summary,
			type,
			(event) => event.preventDefault(),
			{ once: true },
		);
		actions.keyboard.press("Space");
		expect(tree.get(id("#details")).attributes.open).toBeUndefined();
		expect(tree.keyboardActiveElement).toBeNull();
	},
);

it("waits for controlled native click listeners before applying disclosure defaults", async () => {
	const { tree, actions, id } = fixture();
	let enter = () => {};
	let release = () => {};
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	actions.events.addEventListener(
		id("#summary"),
		"click",
		controlledEventListener(async () => {
			enter();
			await waiting;
		}),
	);
	const pending = actions.clickAsync(tree.reference(id("#summary")));
	await entered;
	try {
		expect(tree.get(id("#details")).attributes.open).toBeUndefined();
	} finally {
		release();
	}
	await pending;
	expect(tree.get(id("#details")).attributes.open).toBe("");
});

it.each(["", "false", "OPEN"])(
	"treats parsed open=%j as open regardless of its value",
	(value) => {
		const { tree, document, id } = fixture(
			`<details id="details" open="${value}"><summary>More</summary><div id="content">Content</div></details>`,
		);
		expect(document.getElementById("details").open).toBe(true);
		expect(documentStyles(tree).get(id("#content")).displayed).toBe(true);
		document.getElementById("details").open = false;
		expect(documentStyles(tree).get(id("#content")).displayed).toBe(false);
	},
);

it("keeps a disclosure without a summary closed until its open state changes", () => {
	const { tree, document, id } = fixture(
		'<details id="details"><div id="content">Content</div></details>',
	);
	expect(documentStyles(tree).get(id("#content")).displayed).toBe(false);
	document.getElementById("details").open = true;
	expect(documentStyles(tree).get(id("#content")).displayed).toBe(true);
});

it("does not exempt collapsed descendants from cascade work bounds", () => {
	const { tree } = fixture(
		`<details><summary>More</summary>${"<div>Hidden</div>".repeat(100)}</details>`,
	);
	const styles = new DocumentStyles(tree, { maxWork: 20 });
	try {
		expect(() => styles.get(tree.root)).toThrow(/work limit/i);
	} finally {
		styles.close();
	}
});

it.each([true, false, "", "false", 0, 1, null, undefined])(
	"reflects the open property for %s and updates retained layout state",
	(value) => {
		const { tree, id, document } = fixture();
		const details = document.getElementById("details");
		details.open = value;
		expect(details.open).toBe(Boolean(value));
		expect(details.getAttribute("open")).toBe(value ? "" : null);
		expect(documentStyles(tree).get(id("#content")).displayed).toBe(
			Boolean(value),
		);
		expect(
			Reflect.get(document.getElementById("summary"), "open"),
		).toBeUndefined();
	},
);

it("normalizes an existing open attribute when assigning the reflected property", () => {
	const { document } = fixture();
	const details = document.getElementById("details");
	details.setAttribute("open", "false");
	details.open = true;
	expect(details.getAttribute("open")).toBe("");
});

it("publishes live expanded state with the summary button role", () => {
	const { tree, id, document } = fixture();
	const reference = tree.reference(id("#summary"));
	const before = snapshotDocument(tree);
	expect(snapshotElementRole(tree, id("#summary"))).toBe("button");
	expect(before.entries.find((entry) => entry.ref === reference)).toMatchObject(
		{ role: "button", name: "More", expanded: false },
	);
	document.getElementById("details").open = true;
	const after = snapshotDocument(tree);
	expect(after.entries.find((entry) => entry.ref === reference)).toMatchObject({
		expanded: true,
	});
	expect(after.entries.some((entry) => entry.name === "Inside")).toBe(true);
	const delta = diffSnapshots(before, after);
	expect(delta.reset).toBe(false);
	if (!delta.reset)
		expect(delta.updated.some((entry) => entry.ref === reference)).toBe(true);
});

it("preserves nested closed details and ignores author display overrides on collapsed content", () => {
	const { tree, id, document } = fixture(
		'<details id="outer"><summary>Outer</summary><details id="inner"><summary id="inner-summary">Inner</summary><div id="content">Secret</div></details></details>',
		"#content{display:block!important;visibility:visible!important}",
	);
	expect(documentStyles(tree).get(id("#inner-summary")).displayed).toBe(false);
	document.getElementById("outer").open = true;
	expect(documentStyles(tree).get(id("#inner-summary")).displayed).toBe(true);
	expect(documentStyles(tree).get(id("#content")).displayed).toBe(false);
	document.getElementById("inner").open = true;
	expect(documentStyles(tree).get(id("#content")).displayed).toBe(true);
});

it("clears focus inside a collapsed body but preserves focus inside its summary", () => {
	const { tree, id, actions, document } = fixture();
	const details = document.getElementById("details");
	details.open = true;
	actions.focus.focus(tree.reference(id("#button")));
	details.open = false;
	expect(tree.activeElement).toBeNull();
	details.open = true;
	expect(tree.activeElement).toBeNull();
	actions.focus.focus(tree.reference(id("#summary")));
	details.removeAttribute("open");
	expect(tree.activeElement).toBe(id("#summary"));
});

it("renders the same closed pixels as an equivalent explicitly hidden body", () => {
	const { tree } = fixture();
	const expected = fixture(
		'<details open><summary><span>More</span></summary><div id="content" hidden><button>Inside</button></div></details><button>Outside</button>',
		"#content{display:none}",
	);
	expect(rasterizeDocument(tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
});

it("revokes retained open accessors when bindings close", () => {
	const { dom, document } = fixture();
	const details = document.getElementById("details");
	expect(details.open).toBe(false);
	dom.close();
	expect(() => details.open).toThrow(/closed/i);
	expect(() => {
		details.open = true;
	}).toThrow(/closed/i);
});
