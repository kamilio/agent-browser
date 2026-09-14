import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { runEventAction } from "./event-actions.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { documentScrollIntoView } from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(css = "", target = '<div id="target" tabindex="0"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}body{width:300px}#lead{height:140px}#outer{width:100px;height:80px;overflow:auto}#outer-before,#outer-after{height:100px}#inner{width:80px;height:60px;overflow:auto}#before,#after{height:120px}#target{width:20px;height:20px}#tail{height:400px}${css}</style><div id="lead"></div><main id="outer"><div id="outer-before"></div><div id="inner"><div id="before"></div>${target}<div id="after"></div></div><div id="outer-after"></div></main><div id="tail"></div>`,
		"https://fixture.invalid/overflow-input",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(120, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const actions = documentInteractions(tree);
	const reveal = documentScrollIntoView(tree);
	return {
		tree,
		id,
		actions,
		reveal,
		root: documentScroll(tree),
		scroll: documentElementScroll(tree),
		geometry: documentGeometry(tree),
		focus: () => actions.focus.focus(tree.reference(id("#target"))),
		run: (options?: unknown) =>
			runEventAction(actions.events, reveal.action(id("#target"), options)),
	};
}

function wheelFixture(css = "") {
	const result = fixture(`#lead,#outer-before,#before{height:0}${css}`);
	result.actions.mouse.move(10, 10);
	return result;
}

it("plans nested reveal inner-to-outer without changing scroll or revision", () => {
	const { tree, id, reveal, scroll, root } = fixture();
	root.get();
	scroll.get(id("#inner"));
	scroll.get(id("#outer"));
	const revision = tree.revision;
	const updates = root.metrics().updates;
	const plan = reveal.plan(id("#target"));
	expect(plan).toEqual({
		left: 0,
		top: 140,
		elements: [
			{ target: id("#inner"), left: 0, top: 120 },
			{ target: id("#outer"), left: 0, top: 100 },
		],
	});
	expect(Object.isFrozen(plan)).toBe(true);
	expect(Object.isFrozen(plan?.elements)).toBe(true);
	expect(plan?.elements?.every(Object.isFrozen)).toBe(true);
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get()).toEqual({ x: 0, y: 0 });
	expect(root.metrics().updates).toBe(updates);
	expect(tree.revision).toBe(revision);
});

it("applies nested reveal and dispatches element events before the root event", () => {
	const { tree, id, actions, run, geometry } = fixture();
	const events: unknown[] = [];
	actions.events.addEventListener(
		tree.root,
		"scroll",
		(event) => events.push([event.target, event.bubbles, event.cancelable]),
		{ capture: true },
	);
	expect(run()).toMatchObject({
		hasBox: true,
		changed: true,
		scroll: { x: 0, y: 140 },
	});
	expect(events).toEqual([
		[id("#inner"), false, false],
		[id("#outer"), false, false],
		[tree.root, true, false],
	]);
	expect(geometry.getBoundingClientRect(id("#target")).top).toBe(0);
});

it("stops nearest reveal at the inner port without moving outer ports", () => {
	const { id, run, root, scroll } = fixture();
	expect(run({ container: "nearest" }).changed).toBe(true);
	expect(scroll.get(id("#inner")).scrollTop).toBe(120);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get()).toEqual({ x: 0, y: 0 });
});

it("nearest stops at a port with no scroll range instead of scrolling its ancestors", () => {
	const { id, reveal, run } = fixture("#before,#after{height:0}");
	expect(reveal.plan(id("#target"), { container: "nearest" })).toEqual({
		left: 0,
		top: 0,
	});
	expect(run({ container: "nearest" })).toMatchObject({
		hasBox: true,
		changed: false,
	});
});

it.each(["hidden", "clip"])(
	"programmatic reveal distinguishes overflow:%s from user scrolling",
	(overflow) => {
		const { id, reveal, run, scroll } = fixture(`#inner{overflow:${overflow}}`);
		const plan = reveal.plan(id("#target"), { container: "nearest" });
		expect(plan?.elements?.map((entry) => entry.target)).toEqual([
			id(overflow === "hidden" ? "#inner" : "#outer"),
		]);
		run({ container: "nearest" });
		expect(scroll.get(id("#inner")).scrollTop).toBe(
			overflow === "hidden" ? 120 : 0,
		);
	},
);

it("reveals nested ports inside a fixed ancestor but leaves root scrolling unchanged", () => {
	const { id, run, root, scroll, geometry } = fixture(
		"#outer{position:fixed;left:5px;top:5px}",
	);
	root.to(0, 50);
	expect(run()).toMatchObject({ changed: true, scroll: { x: 0, y: 50 } });
	expect(scroll.get(id("#inner")).scrollTop).toBe(120);
	expect(scroll.get(id("#outer")).scrollTop).toBe(100);
	expect(geometry.getBoundingClientRect(id("#target")).top).toBe(5);
});

it("does not scroll DOM ancestors of a fixed target", () => {
	const { id, reveal, root, scroll } = fixture(
		"#target{position:fixed;left:10px;top:10px}",
	);
	root.to(0, 50);
	expect(reveal.plan(id("#target"))).toEqual({ left: 0, top: 50 });
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
});

it.each([
	["start", 120],
	["center", 100],
	["end", 80],
	["nearest", 80],
] as const)("aligns a nested target using %s", (block, expected) => {
	const { id, run, scroll } = fixture();
	run({ block, container: "nearest" });
	expect(scroll.get(id("#inner")).scrollTop).toBe(expected);
});

it("aligns to the scrollport padding edge rather than its border or content edge", () => {
	const { id, run, scroll, geometry } = fixture(
		"#inner{padding:5px;border:3px solid black}",
	);
	run({ container: "nearest" });
	expect(scroll.get(id("#inner")).scrollTop).toBe(125);
	expect(geometry.getBoundingClientRect(id("#target")).top).toBe(
		geometry.getBoundingClientRect(id("#inner")).top + 3,
	);
});

it("reveals a scroll container itself without changing its own scroll position", () => {
	const { id, reveal, scroll } = fixture();
	scroll.to(id("#inner"), 0, 50);
	expect(reveal.plan(id("#inner"))?.elements).toEqual([
		{ target: id("#outer"), left: 0, top: 100 },
	]);
	expect(scroll.get(id("#inner")).scrollTop).toBe(50);
});

it("retains the original root-only plan shape when no nested port is present", () => {
	const { id, reveal } = fixture("#inner,#outer{overflow:visible}");
	expect(reveal.plan(id("#target"))).toEqual({ left: 0, top: 360 });
});

it("reveals the HTML root through its viewport alias", () => {
	const { id, reveal, root } = fixture();
	root.to(0, 50);
	expect(reveal.plan(id("html"))).toEqual({ left: 0, top: 0 });
	expect(root.get().y).toBe(50);
});

it("stops remaining reveal entries when the owner closes during dispatch", () => {
	const { id, reveal, root, scroll } = fixture();
	const action = reveal.action(id("#target"));
	expect(action.next().value).toMatchObject({ target: id("#inner") });
	reveal.close();
	expect(() => action.next(true)).toThrow("Scroll into view is closed");
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
});

it("wheels the innermost user port and refreshes hover after scrolling", () => {
	const { tree, id, actions, scroll, root } = wheelFixture();
	const entered: (number | null)[] = [];
	actions.events.addEventListener(tree.root, "mouseover", (event) =>
		entered.push(event.target),
	);
	expect(actions.mouse.wheel(0, 25)).toMatchObject({
		canceled: false,
		scroll: { x: 0, y: 0 },
	});
	expect(scroll.get(id("#inner")).scrollTop).toBe(25);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
	expect(entered).toContain(id("#after"));
});

it("chains horizontal and vertical wheel deltas independently", () => {
	const { id, actions, scroll, root } = wheelFixture(
		"#inner{overflow-x:hidden;overflow-y:auto}#after,#outer-after{width:220px}",
	);
	actions.mouse.wheel(30, 20);
	expect(scroll.get(id("#inner"))).toMatchObject({
		scrollLeft: 0,
		scrollTop: 20,
	});
	expect(scroll.get(id("#outer"))).toMatchObject({
		scrollLeft: 30,
		scrollTop: 0,
	});
	expect(root.get()).toEqual({ x: 0, y: 0 });
});

it("chains only unconsumed wheel distance at a nested boundary", () => {
	const { tree, id, actions, scroll } = wheelFixture();
	const maximum = scroll.bounds(id("#inner")).y;
	scroll.to(id("#inner"), 0, maximum - 5);
	const events: unknown[] = [];
	actions.events.addEventListener(
		tree.root,
		"scroll",
		(event) => events.push([event.target, event.bubbles]),
		{ capture: true },
	);
	actions.mouse.wheel(0, 20);
	expect(scroll.get(id("#inner")).scrollTop).toBe(maximum);
	expect(scroll.get(id("#outer")).scrollTop).toBe(15);
	expect(events).toEqual([
		[id("#inner"), false],
		[id("#outer"), false],
	]);
});

it("preserves fractional wheel remainder at a nested boundary", () => {
	const { id, actions, scroll } = wheelFixture();
	const maximum = scroll.bounds(id("#inner")).y;
	scroll.to(id("#inner"), 0, maximum - 0.5);
	actions.mouse.wheel(0, 0.75);
	expect(scroll.get(id("#inner")).scrollTop).toBe(maximum);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0.25);
});

it.each(["hidden", "clip"])(
	"wheel skips an overflow:%s port and uses an eligible ancestor",
	(overflow) => {
		const { id, actions, scroll } = wheelFixture(
			`#inner{overflow:${overflow}}`,
		);
		actions.mouse.wheel(0, 25);
		expect(scroll.get(id("#inner")).scrollTop).toBe(0);
		expect(scroll.get(id("#outer")).scrollTop).toBe(25);
	},
);

it("canceled wheel dispatch never applies nested or root scrolling", () => {
	const { tree, id, actions, scroll, root } = wheelFixture();
	actions.events.addEventListener(tree.root, "wheel", (event) =>
		event.preventDefault(),
	);
	expect(actions.mouse.wheel(0, 25).canceled).toBe(true);
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
});

it("retains unsupported modified-wheel rejection before moving nested ports", () => {
	const { id, actions, scroll } = wheelFixture();
	actions.keyboard.down("Control");
	expect(() => actions.mouse.wheel(0, 25)).toThrow(
		"Modified wheel defaults are not implemented",
	);
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
});

it("wheel over fixed content may scroll the page without moving the fixed target", () => {
	const { id, actions, geometry, root } = wheelFixture(
		"#outer{position:fixed;top:0;left:0;overflow:visible}#inner{overflow:visible}",
	);
	actions.mouse.wheel(0, 20);
	expect(root.get().y).toBe(20);
	expect(geometry.getBoundingClientRect(id("#target")).top).toBe(0);
});

it("root fallback retains the document-targeted bubbling scroll event", () => {
	const { tree, actions, root } = wheelFixture(
		"#inner,#outer{overflow:visible}",
	);
	const events: unknown[] = [];
	actions.events.addEventListener(tree.root, "scroll", (event) =>
		events.push([event.target, event.bubbles]),
	);
	actions.mouse.wheel(0, 20);
	expect(root.get().y).toBe(20);
	expect(events).toEqual([[tree.root, true]]);
});

it("viewport hidden prevents direct wheel and keyboard root fallback", () => {
	const { actions, root } = wheelFixture(
		"html{overflow:hidden}#inner,#outer{overflow:visible}",
	);
	actions.mouse.wheel(0, 20);
	actions.keyboard.press("PageDown");
	expect(root.get()).toEqual({ x: 0, y: 0 });
	expect(root.to(0, 20)).toBe(true);
});

it.each(["PageDown", "Space"])(
	"focused %s uses the nearest padding-box height without root movement",
	(key) => {
		const { id, actions, focus, scroll, root } = fixture("#inner{padding:4px}");
		focus();
		expect(actions.keyboard.press(key)).toMatchObject({
			scroll: { x: 0, y: 0 },
		});
		expect(scroll.get(id("#inner")).scrollTop).toBe(68 * 0.875);
		expect(scroll.get(id("#outer")).scrollTop).toBe(0);
		expect(root.get().y).toBe(0);
	},
);

it("focused Home and End use the element bounds and preserve its horizontal offset", () => {
	const { id, actions, focus, scroll } = fixture("#target{width:200px}");
	focus();
	scroll.to(id("#inner"), 20, 30);
	actions.keyboard.press("End");
	expect(scroll.get(id("#inner"))).toMatchObject({
		scrollLeft: 20,
		scrollTop: scroll.bounds(id("#inner")).y,
	});
	actions.keyboard.press("Home");
	expect(scroll.get(id("#inner"))).toMatchObject({
		scrollLeft: 20,
		scrollTop: 0,
	});
});

it("uses a focused scroll container itself before considering its ancestors", () => {
	const { id, actions, focus, scroll, root } = fixture(
		"#target{overflow:auto}",
		'<div id="target" tabindex="0"><div style="height:200px"></div></div>',
	);
	focus();
	actions.keyboard.press("PageDown");
	expect(scroll.get(id("#target")).scrollTop).toBe(17.5);
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
});

it("focused keyboard scrolling falls back to an ancestor at the inner boundary", () => {
	const { id, actions, focus, scroll, root } = fixture();
	focus();
	scroll.to(id("#inner"), 0, scroll.bounds(id("#inner")).y);
	actions.keyboard.press("ArrowDown");
	expect(scroll.get(id("#outer")).scrollTop).toBe(40);
	expect(root.get().y).toBe(0);
});

it.each(["hidden", "clip"])(
	"focused keyboard scrolling skips overflow:%s",
	(overflow) => {
		const { id, actions, focus, scroll } = fixture(
			`#inner{overflow:${overflow}}`,
		);
		focus();
		actions.keyboard.press("PageDown");
		expect(scroll.get(id("#inner")).scrollTop).toBe(0);
		expect(scroll.get(id("#outer")).scrollTop).toBe(70);
	},
);

it("keyboard element scroll events do not bubble to a document listener", () => {
	const { tree, id, actions, focus } = fixture();
	focus();
	const events: unknown[] = [];
	actions.events.addEventListener(id("#inner"), "scroll", (event) =>
		events.push([event.target, event.bubbles, event.cancelable]),
	);
	actions.events.addEventListener(tree.root, "scroll", () =>
		events.push("document"),
	);
	actions.keyboard.press("ArrowDown");
	expect(events).toEqual([[id("#inner"), false, false]]);
});

it("canceled keydown prevents focused port scrolling", () => {
	const { tree, id, actions, focus, scroll, root } = fixture();
	focus();
	actions.events.addEventListener(tree.root, "keydown", (event) =>
		event.preventDefault(),
	);
	actions.keyboard.press("PageDown");
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
});

it.each([
	'<input id="target">',
	'<textarea id="target"></textarea>',
	'<div id="target" tabindex="0" contenteditable="true">text</div>',
])("preserves editable defaults within scrollports: %s", (target) => {
	const { id, actions, focus, scroll, root } = fixture("", target);
	focus();
	actions.keyboard.press("PageDown");
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
	expect(scroll.get(id("#outer")).scrollTop).toBe(0);
	expect(root.get().y).toBe(0);
});

it("keyboard without focus still uses the viewport page step", () => {
	const { actions, root } = fixture();
	expect(actions.keyboard.press("PageDown")).toMatchObject({
		scroll: { x: 0, y: 87.5 },
	});
	expect(root.get().y).toBe(87.5);
});

it("aborted async wheel does not begin a nested default action", async () => {
	const { id, actions, scroll } = wheelFixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		actions.mouse.wheelAsync(0, 25, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(scroll.get(id("#inner")).scrollTop).toBe(0);
});
