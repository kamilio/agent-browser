import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { runEventAction } from "./event-actions.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	documentScrollIntoView,
	scrollIntoViewCapabilities,
} from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
function fixture(css = "", content = '<div id="target" tabindex="0"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{width:400px;height:500px}#before{height:160px}#target{margin-left:150px;width:20px;height:20px}#after{height:320px}${css}</style><main><div id="before"></div>${content}<div id="after"></div></main>`,
		"https://fixture.invalid/into-view",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw new Error("Missing target");
	const owner = documentScrollIntoView(tree);
	const interactions = documentInteractions(tree);
	return {
		tree,
		id,
		owner,
		interactions,
		scroll: documentScroll(tree),
		run: (argument?: unknown) =>
			runEventAction(interactions.events, owner.action(id, argument)),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([undefined, null, true, {}, "truthy"])(
	"uses default start/nearest alignment for %s",
	(argument) => {
		const { run } = fixture();
		expect(run(argument)).toMatchObject({
			hasBox: true,
			changed: true,
			scroll: { x: 70, y: 160 },
		});
	},
);

it.each([false, 0, ""])(
	"supports legacy false alignment for %s",
	(argument) => {
		const { run } = fixture();
		expect(run(argument).scroll).toEqual({ x: 70, y: 100 });
	},
);

it.each([
	["start", 150, 160],
	["end", 70, 100],
	["center", 110, 130],
	["nearest", 70, 100],
] as const)("aligns both axes using %s", (alignment, horizontal, vertical) => {
	const { run } = fixture();
	expect(run({ block: alignment, inline: alignment }).scroll).toEqual({
		x: horizontal,
		y: vertical,
	});
});

it("keeps a fully visible target stationary for nearest alignment", () => {
	const { run, scroll } = fixture();
	scroll.to(140, 150);
	expect(run({ block: "nearest", inline: "nearest" })).toMatchObject({
		changed: false,
		scroll: { x: 140, y: 150 },
	});
});

it.each([
	[200, 200, 200, 200],
	[100, 100, 150, 160],
	[300, 280, 250, 240],
] as const)(
	"handles oversized nearest targets from %s,%s",
	(horizontal, vertical, expectedHorizontal, expectedVertical) => {
		const { run, scroll } = fixture(
			"#target{width:200px;height:160px}#after{height:180px}",
		);
		scroll.to(horizontal, vertical);
		expect(run({ block: "nearest", inline: "nearest" }).scroll).toEqual({
			x: expectedHorizontal,
			y: expectedVertical,
		});
	},
);

it("aligns an offscreen target exactly the viewport size", () => {
	const { run } = fixture(
		"#target{width:100px;height:80px}#after{height:260px}",
	);
	expect(run({ block: "nearest", inline: "nearest" }).scroll).toEqual({
		x: 150,
		y: 160,
	});
});

it("clamps requested alignment at document boundaries", () => {
	const { run } = fixture(
		"#before{height:480px}#after{height:0}#target{margin-left:-20px}",
	);
	expect(run({ block: "start", inline: "start" }).scroll).toEqual({
		x: 0,
		y: 420,
	});
});

it("uses current resized viewport dimensions", () => {
	const { tree, run } = fixture();
	documentStyles(tree).setViewport(200, 100);
	expect(run({ block: "end", inline: "nearest" }).scroll).toEqual({
		x: 0,
		y: 80,
	});
});

it("keeps fractional center alignment", () => {
	const { run } = fixture(
		"#target{width:21px;height:21px}#after{height:319px}",
	);
	expect(run({ block: "center", inline: "center" }).scroll).toEqual({
		x: 110.5,
		y: 130.5,
	});
});

it("uses zero-sized associated boxes rather than treating anchors as absent", () => {
	const { run } = fixture("#target{width:0;height:0}");
	expect(run()).toMatchObject({ hasBox: true, scroll: { x: 50, y: 160 } });
});

it.each(["display:none", "display:contents"])(
	"does not scroll a target without a box: %s",
	(css) => {
		const { run } = fixture(`#target{${css}}`);
		expect(run()).toMatchObject({
			hasBox: false,
			changed: false,
			scroll: { x: 0, y: 0 },
		});
	},
);

it("does not treat visibility:hidden as absence of layout", () => {
	const { run } = fixture("#target{visibility:hidden}");
	expect(run()).toMatchObject({ hasBox: true, scroll: { x: 70, y: 160 } });
});

it("delivers a noncancelable scroll after native movement without focus or click", () => {
	const { tree, id, run, interactions } = fixture();
	const seen: unknown[] = [];
	interactions.events.addEventListener(tree.root, "scroll", (event) => {
		event.preventDefault();
		seen.push([
			event.cancelable,
			event.bubbles,
			documentGeometry(tree).getBoundingClientRect(id).y,
		]);
	});
	interactions.events.addEventListener(tree.root, "click", () =>
		seen.push("click"),
	);
	run();
	run();
	expect(seen).toEqual([[false, true, 0]]);
	expect(interactions.focus.active()).toBe(null);
});

it.each(["block", "inline", "behavior", "container"])(
	"rejects invalid %s options without moving",
	(property) => {
		const { run, scroll } = fixture();
		expect(() => run({ [property]: "invalid" })).toThrow(TypeError);
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it("rejects smooth animation and accessor/inherited dictionaries", () => {
	const { run } = fixture();
	expect(() => run({ behavior: "smooth" })).toThrow(/Smooth/);
	expect(() => run(Object.create({ block: "end" }))).toThrow(/dictionary/);
	let calls = 0;
	expect(() =>
		run({
			get block() {
				calls++;
				return "end";
			},
		}),
	).toThrow(/accessor/);
	expect(calls).toBe(0);
});

it.each(["all", "nearest"])(
	"supports %s container selection within the root-only profile",
	(container) => {
		const { run } = fixture();
		expect(run({ container }).scroll).toEqual({ x: 70, y: 160 });
	},
);

it.each(["position:sticky", "overflow:auto"])(
	"does not guess geometry for unsupported %s",
	(css) => {
		const { run } = fixture(`#target{${css}}`);
		expect(() => run()).toThrow();
	},
);

it("returns a no-op plan for detached nodes and bounds repeated calls", () => {
	const { tree, owner } = fixture();
	const detached = tree.createElement("div");
	for (
		let request = 0;
		request < scrollIntoViewCapabilities.maxRequests;
		request++
	)
		expect(owner.plan(detached)).toBeNull();
	expect(() => owner.plan(detached)).toThrow(/request limit/);
});

it("rejects non-element targets and revokes the owner on closure", () => {
	const { tree, id, owner } = fixture();
	expect(() => owner.plan(tree.root)).toThrow(/element/);
	tree.close();
	expect(owner.metrics().closed).toBe(true);
	expect(() => owner.plan(id)).toThrow(/closed/);
});

it("reports the final revision after a scroll listener forces native clamping", () => {
	const { tree, interactions, run } = fixture();
	const main = new DocumentQueries(tree).querySelector("main");
	if (main === null) throw new Error("Missing main");
	interactions.events.addEventListener(tree.root, "scroll", () =>
		tree.setAttribute(main, "style", "display:none"),
	);
	const result = run();
	expect(result.scroll).toEqual({ x: 0, y: 0 });
	expect(result.revision).toBe(tree.revision);
	expect(result.changed).toBe(true);
});

it("aligns the full union of wrapped inline fragments rather than only the first line", () => {
	const { tree, id, run } = fixture(
		"#target{margin-left:0;width:auto;height:auto}#wrapper{width:80px;font-size:8px;line-height:12px}",
		'<div id="wrapper"><span id="target">one two three four five six seven</span></div>',
	);
	const geometry = documentGeometry(tree);
	expect(geometry.getClientRects(id).length).toBeGreaterThan(1);
	const before = geometry.getBoundingClientRect(id);
	expect(run({ block: "end" }).scroll.y).toBe(before.bottom - 80);
	expect(geometry.getBoundingClientRect(id).bottom).toBe(80);
});
