import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { controlledEventListener } from "./events.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(css = "", content = '<div id="target" tabindex="0"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{width:40px;height:20px;background:blue}${css}</style>${content}`,
		"https://fixture.invalid/pointer-state",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(100, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const actions = documentInteractions(tree);
	return { tree, styles, queries, id, target, actions, mouse: actions.mouse };
}
function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

it("starts with no pointer state and does not confuse keyboard focus with activation", () => {
	const { tree, queries, actions, target } = fixture();
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
	actions.focus.focus(tree.reference(target));
	expect(queries.querySelector(":focus")).toBe(target);
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
});

it("matches the designated element and its ancestors but not its siblings", () => {
	const { tree, queries, id, target, mouse } = fixture(
		"",
		'<main id="parent"><div id="target"></div><div id="other"></div></main>',
	);
	mouse.move(10, 10);
	expect(tree.pointerHoverElement).toBe(target);
	expect(queries.querySelectorAll(":hover")).toEqual([
		id("html"),
		id("body"),
		id("#parent"),
		target,
	]);
	expect(queries.matches(id("#other"), ":hover")).toBe(false);
	mouse.move(110, 90);
	expect(queries.querySelectorAll(":hover")).toEqual([]);
});

it("shares state with :is, :where, :not, :has and descendant matching", () => {
	const { queries, mouse, target, id } = fixture(
		"",
		'<main id="parent"><div id="target"></div></main>',
	);
	mouse.move(10, 10);
	for (const selector of [
		"#target:hover",
		"#target:is(:hover)",
		"#target:where(:hover)",
		"#target:not(:active)",
		"main:hover > #target",
	])
		expect(queries.querySelector(selector)).toBe(target);
	expect(queries.querySelector("main:has(> :hover)")).toBe(id("#parent"));
});

it("uses pseudo-class specificity and does not report hover as an unsupported selector", () => {
	const { queries, styles, target, mouse } = fixture(
		"#target:hover{background:red}div{background:green}",
	);
	mouse.move(10, 10);
	expect(queries.matchingSpecificities("div:hover").get(target)).toEqual([
		0, 1, 1,
	]);
	expect(styles.paint(target)["background-color"]).toEqual([255, 0, 0, 255]);
	expect(
		styles.metrics().issues["unimplemented-or-invalid-css-selector"],
	).toBeUndefined();
});

it("updates stylesheet pixels and computed geometry through shared owners", () => {
	const { tree, mouse, target } = fixture(
		"#target:hover{background:red;width:60px}",
	);
	const before = rasterizeDocument(tree).image;
	expect([...before.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
	mouse.move(10, 10);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(60);
	expect([...rasterizeDocument(tree).image.pixels.slice(0, 4)]).toEqual([
		255, 0, 0, 255,
	]);
	expect(documentHitTesting(tree).elementFromPoint(50, 10)).toBe(target);
	mouse.move(90, 70);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(40);
	expect([...rasterizeDocument(tree).image.pixels.slice(0, 4)]).toEqual([
		0, 0, 255, 255,
	]);
});

it("reveals a stylesheet-only submenu and keeps its parent hovered over the child", () => {
	const { tree, mouse, queries, id } = fixture(
		"#menu{width:50px}#target{height:20px}#submenu{display:none;width:50px;height:20px}#menu:hover #submenu{display:block}",
		'<nav id="menu"><div id="target">Menu</div><div id="submenu">Item</div></nav>',
	);
	const submenu = id("#submenu");
	expect(documentGeometry(tree).getClientRects(submenu)).toEqual([]);
	mouse.move(10, 10);
	expect(documentGeometry(tree).getBoundingClientRect(submenu).height).toBe(20);
	mouse.move(10, 30);
	expect(tree.pointerHoverElement).toBe(submenu);
	expect(queries.matches(id("#menu"), ":hover")).toBe(true);
	mouse.move(90, 70);
	expect(documentGeometry(tree).getClientRects(submenu)).toEqual([]);
});

it("exposes hover to boundary listeners before they read styles", () => {
	const { actions, mouse, target, queries, styles } = fixture(
		"#target:hover{background:red}",
	);
	const observed: unknown[] = [];
	for (const type of [
		"mouseover",
		"mouseenter",
		"mousemove",
		"mouseout",
		"mouseleave",
	])
		actions.events.addEventListener(target, type, () =>
			observed.push([
				type,
				queries.matches(target, ":hover"),
				styles.paint(target)["background-color"],
			]),
		);
	mouse.move(10, 10);
	mouse.move(90, 70);
	expect(observed).toEqual([
		["mouseover", true, [255, 0, 0, 255]],
		["mouseenter", true, [255, 0, 0, 255]],
		["mousemove", true, [255, 0, 0, 255]],
		["mouseout", false, [0, 0, 255, 255]],
		["mouseleave", false, [0, 0, 255, 255]],
	]);
});

it("exposes active state before down and clears it before up and click", () => {
	const { actions, mouse, target, queries } = fixture();
	const observed: unknown[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		actions.events.addEventListener(target, type, () =>
			observed.push([type, queries.matches(target, ":active")]),
		);
	mouse.move(10, 10);
	mouse.down();
	expect(queries.matches(target, ":hover:active")).toBe(true);
	mouse.up();
	expect(observed).toEqual([
		["mousedown", true],
		["mouseup", false],
		["click", false],
	]);
});

it.each(["middle", "right"] as const)(
	"does not make %s button holds primary activation",
	(button) => {
		const { queries, mouse } = fixture();
		mouse.move(10, 10);
		mouse.down(button);
		expect(queries.querySelectorAll(":active")).toEqual([]);
		mouse.up(button);
	},
);

it("keeps primary activation when another held button is released", () => {
	const { target, queries, mouse } = fixture();
	mouse.move(10, 10);
	mouse.down("left");
	mouse.down("right");
	mouse.up("right");
	expect(queries.matches(target, ":active")).toBe(true);
	mouse.up("left");
	expect(queries.querySelectorAll(":active")).toEqual([]);
});

it("keeps the primary press origin while hovering another element", () => {
	const { target, queries, mouse, id } = fixture(
		"#other{width:40px;height:20px}",
		'<div id="target"></div><div id="other"></div>',
	);
	mouse.move(10, 10);
	mouse.down();
	mouse.move(10, 30);
	expect(queries.matches(target, ":active")).toBe(true);
	expect(queries.matches(target, ":hover")).toBe(false);
	expect(queries.matches(id("#other"), ":hover")).toBe(true);
	expect(queries.matches(id("#other"), ":active")).toBe(false);
	mouse.up();
});

it("does not clear physical active state when mousedown is canceled", () => {
	const { actions, queries, mouse, target } = fixture();
	actions.events.addEventListener(target, "mousedown", (event) =>
		event.preventDefault(),
	);
	mouse.move(10, 10);
	mouse.down();
	expect(queries.matches(target, ":active")).toBe(true);
	mouse.up();
	expect(queries.matches(target, ":active")).toBe(false);
});

it.each(["hover", "active"])(
	"forwards label :%s to its control, but not to that control's other ancestors",
	(state) => {
		const { mouse, queries, id } = fixture(
			"#target{display:block}input{display:none}",
			'<main id="parent"><label id="target" for="control">Label</label><section id="elsewhere"><input id="control"></section></main>',
		);
		mouse.move(10, 10);
		if (state === "active") mouse.down();
		expect(queries.matches(id("#control"), `:${state}`)).toBe(true);
		expect(queries.matches(id("#parent"), `:${state}`)).toBe(true);
		expect(queries.matches(id("#elsewhere"), `:${state}`)).toBe(false);
		if (state === "active") mouse.up();
	},
);

it("does not forward control hover back to a separate label", () => {
	const { mouse, queries, id } = fixture(
		"",
		'<button id="target">Go</button><label for="target" id="label">Label</label>',
	);
	mouse.move(10, 10);
	expect(queries.matches(id("#label"), ":hover")).toBe(false);
});

it("forwards an implicit label's state to its first labelable descendant only", () => {
	const { mouse, queries, id } = fixture(
		"#target{display:block}input{display:none}",
		'<label id="target">Label<input id="first"><input id="second"></label>',
	);
	mouse.move(10, 10);
	expect(queries.matches(id("#first"), ":hover")).toBe(true);
	expect(queries.matches(id("#second"), ":hover")).toBe(false);
});

it("does not skip a nonlabelable first duplicate ID during forwarding", () => {
	const { mouse, queries, id } = fixture(
		"#target{display:block}input{display:none}",
		'<label id="target" for="duplicate">Label</label><div id="duplicate"></div><input id="duplicate" data-control>',
	);
	mouse.move(10, 10);
	expect(queries.matches(id("[data-control]"), ":hover")).toBe(false);
});

it("does not retain a removed label-control association through a cached query", () => {
	const { tree, mouse, queries, id } = fixture(
		"#target{display:block}input{display:none}",
		'<label id="target" for="control">Label</label><input id="control">',
	);
	mouse.move(10, 10);
	const control = id("#control");
	expect(queries.matches(control, ":hover")).toBe(true);
	tree.remove(control);
	expect(queries.matches(control, ":hover")).toBe(false);
});

it("updates label associations without requiring pointer movement", () => {
	const { tree, mouse, queries, id, target } = fixture(
		"#target{display:block}input{display:none}",
		'<label id="target" for="first">Label</label><input id="first"><input id="second">',
	);
	mouse.move(10, 10);
	expect(queries.matches(id("#first"), ":hover")).toBe(true);
	tree.setAttribute(target, "for", "second");
	expect(queries.matches(id("#first"), ":hover")).toBe(false);
	expect(queries.matches(id("#second"), ":hover")).toBe(true);
});

it("clears state on removal and does not resurrect it on reinsertion", () => {
	const { tree, mouse, target, queries, id } = fixture();
	mouse.move(10, 10);
	mouse.down();
	const body = id("body");
	tree.remove(target);
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
	expect(queries.matches(target, ":hover, :active")).toBe(false);
	tree.append(body, target);
	expect(queries.matches(target, ":hover, :active")).toBe(false);
	mouse.up();
});

it("clears state when an ancestor's children are replaced", () => {
	const { tree, mouse, queries, id } = fixture(
		"",
		'<main id="parent"><div id="target"></div></main>',
	);
	mouse.move(10, 10);
	mouse.down();
	tree.replaceChildren(id("#parent"));
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
});

it("retains state and follows ancestors when a live target is reparented", () => {
	const { tree, mouse, queries, target, id } = fixture(
		"",
		'<main id="first"><div id="target"></div></main><section id="second"></section>',
	);
	mouse.move(10, 10);
	tree.append(id("#second"), target);
	expect(queries.matches(id("#first"), ":hover")).toBe(false);
	expect(queries.matches(id("#second"), ":hover")).toBe(true);
});

it("does not change document revision for movement within an unchanged state", () => {
	const { tree, mouse } = fixture();
	mouse.move(10, 10);
	const revision = tree.revision;
	mouse.move(15, 10);
	expect(tree.revision).toBe(revision);
	mouse.move(90, 70);
	expect(
		tree.changesSince(revision).changes.map((change) => change.kind),
	).toEqual(["pointer"]);
});

it("rejects invalid and detached native state atomically", () => {
	const { tree, target } = fixture();
	tree.setPointerState(target, null);
	const detached = tree.createElement("div");
	expect(() => tree.setPointerState(null, detached)).toThrow(
		"connected element",
	);
	expect(tree.pointerHoverElement).toBe(target);
	expect(tree.pointerActiveElement).toBeNull();
	expect(() => tree.setPointerState(tree.root, null)).toThrow();
});

it("clears published state when mouse or document ownership closes", () => {
	const { tree, mouse, queries } = fixture();
	mouse.move(10, 10);
	mouse.down();
	mouse.close();
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
	tree.close();
	expect(tree.pointerHoverElement).toBeNull();
	expect(tree.pointerActiveElement).toBeNull();
});

it("bounds self-hiding hover feedback instead of hanging", () => {
	const { mouse } = fixture("#target:hover{display:none}");
	expect(() => mouse.move(10, 10)).toThrow(
		"Mouse hover target did not stabilize",
	);
	expect(mouse.metrics().busy).toBe(false);
});

it("clears gesture-owned active CSS after aborting a pending mousedown", async () => {
	const { tree, actions, mouse, target, queries } = fixture();
	const waiting = gate();
	const entered = gate();
	const controller = new AbortController();
	actions.events.addEventListener(
		target,
		"mousedown",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = mouse.clickTargetAsync(
		tree.reference(target),
		{ x: 10, y: 10 },
		controller.signal,
	);
	await entered.pending;
	expect(queries.matches(target, ":active")).toBe(true);
	controller.abort();
	try {
		await expect(pending).rejects.toMatchObject({ code: "aborted" });
	} finally {
		waiting.release();
	}
	expect(queries.matches(target, ":active")).toBe(false);
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it("does not manufacture hover or active state for programmatic activation", () => {
	const { actions, queries, target } = fixture();
	actions.programmaticClick(target);
	expect(queries.querySelectorAll(":hover, :active")).toEqual([]);
});
