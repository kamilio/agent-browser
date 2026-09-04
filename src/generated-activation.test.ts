import { afterEach, expect, it, vi } from "vitest";
import * as clickTargets from "./click-target.js";
import type { ClickTargetResult } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(
	markup = '<details id="host"><div id="body">Body</div></details>',
	css = "",
) {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}details{width:120px;font-size:16px;line-height:16px}#body{height:32px}${css}</style>${markup}`,
		"https://fixture.invalid/generated-activation",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const id = (name: string) => {
		const result = [...tree.walk()].find(
			({ node }) => node.attributes.id === name,
		)?.node.id;
		if (result === undefined) throw new Error("Missing fixture node");
		return result;
	};
	const host = id("host");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(host);
	if (!target) throw new Error("Missing generated target");
	const actions = documentInteractions(tree);
	const point = (hover = false) =>
		(
			Reflect.get(
				clickTargets,
				hover ? "findGeneratedHoverPoint" : "findGeneratedClickPoint",
			) as (tree: DocumentTree, ref: string) => ClickTargetResult
		)(tree, target.ref);
	const click = (x = 4, y = 4) => {
		actions.mouse.move(x, y);
		actions.mouse.down();
		return actions.mouse.up();
	};
	const open = () => Object.hasOwn(tree.get(host).attributes, "open");
	return {
		tree,
		host,
		target,
		controls,
		actions,
		mouse: actions.mouse,
		id,
		point,
		click,
		open,
	};
}

it.each([false, true])(
	"activates a generated reference through native direct activation, async=%s",
	async (async) => {
		const { tree, host, target, actions, open } = fixture();
		const before = tree.nodeCount;
		const result = async
			? await actions.clickAsync(target.ref)
			: actions.click(target.ref);
		expect(open()).toBe(true);
		expect(result).toMatchObject({
			reference: target.ref,
			defaultPrevented: false,
		});
		expect(result.defaultAction).toBeUndefined();
		expect(tree.nodeCount).toBe(before);
		expect(tree.get(host).children).toHaveLength(1);
		actions.click(target.ref);
		expect(open()).toBe(false);
	},
);

it("performs a real primary pointer sequence with host-retargeted events and generated activation identity", () => {
	const { tree, host, target, actions, click, open } = fixture();
	const observed: unknown[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		actions.events.addEventListener(host, type, (event) =>
			observed.push([
				event.type,
				event.target,
				event.currentTarget,
				event.composedPath()[0],
			]),
		);
	const result = click();
	expect(open()).toBe(true);
	expect(result.reference).toBe(tree.reference(host));
	expect(result.interaction?.reference).toBe(target.ref);
	expect(observed).toEqual(
		["mousedown", "mouseup", "click"].map((type) => [type, host, host, host]),
	);
});

it("targets only header geometry when the open body is taller", async () => {
	const { tree, host, target, mouse, point, open } = fixture(
		'<details id="host" open><div id="body" style="height:80px">Body</div></details>',
	);
	const found = point();
	expect(found.point).toBeDefined();
	expect(found.point?.y).toBeLessThan(16);
	expect(documentGeometry(tree).getBoundingClientRect(host).height).toBe(96);
	if (!found.point) throw new Error("Missing header click point");
	const result = await mouse.clickTargetAsync(target.ref, found.point);
	expect(result.interaction?.reference).toBe(target.ref);
	expect(open()).toBe(false);
});

it("lets ordinary host-targeted pointer clicks activate a header while synthetic host clicks do not", async () => {
	const { tree, host, actions, mouse, open } = fixture();
	actions.click(tree.reference(host));
	actions.programmaticClick(host);
	expect(open()).toBe(false);
	await mouse.clickTargetAsync(tree.reference(host), { x: 4, y: 4 });
	expect(open()).toBe(true);
});

it.each(["click", "mousedown", "mouseup"])(
	"handles canceled %s without conflating click cancellation with pointer phase cancellation",
	(type) => {
		const { actions, host, click, open } = fixture();
		actions.events.addEventListener(host, type, (event) =>
			event.preventDefault(),
		);
		const result = click();
		expect(open()).toBe(type !== "click");
		if (type === "click")
			expect(result.interaction?.defaultPrevented).toBe(true);
	},
);

it.each(["middle", "right"] as const)(
	"does not activate fallback for the %s button",
	(button) => {
		const { mouse, open } = fixture();
		mouse.move(4, 4);
		mouse.down(button);
		mouse.up(button);
		expect(open()).toBe(false);
	},
);

it("does not activate when released without a press", () => {
	const { mouse, open } = fixture();
	mouse.move(4, 4);
	mouse.up();
	expect(open()).toBe(false);
});

it.each([false, true])(
	"does not toggle from open-body clicks, direct text=%s",
	(text) => {
		const { click, open } = fixture(
			text
				? '<details id="host" open>Body</details>'
				: '<details id="host" open><div id="body">Body</div></details>',
		);
		const result = click(4, 20);
		expect(open()).toBe(true);
		expect(result.interaction?.reference.startsWith("u")).toBe(false);
	},
);

it.each([false, true])(
	"does not turn header/body drags into header activation, reverse=%s",
	(reverse) => {
		const { mouse, open } = fixture('<details id="host" open>Body</details>');
		mouse.move(4, reverse ? 20 : 4);
		mouse.down();
		mouse.move(4, reverse ? 4 : 20);
		const result = mouse.up();
		expect(open()).toBe(true);
		expect(result.interaction?.reference.startsWith("u")).toBe(false);
	},
);

it.each(["insert-summary", "detach", "hide", "inert"])(
	"revalidates generated availability after click handlers %s",
	(change) => {
		const { tree, host, target, actions, open } = fixture();
		actions.events.addEventListener(host, "click", () => {
			if (change === "insert-summary")
				tree.append(host, tree.createElement("summary"));
			else if (change === "detach") tree.remove(host);
			else tree.setAttribute(host, change === "hide" ? "hidden" : "inert", "");
		});
		expect(actions.click(target.ref).defaultPrevented).toBe(false);
		expect(open()).toBe(false);
	},
);

it("waits for a controlled click prefix before choosing the default", async () => {
	const { tree, host, target, actions, open } = fixture();
	actions.events.addEventListener(
		host,
		"click",
		controlledEventListener(async () => {
			await Promise.resolve();
			tree.append(host, tree.createElement("summary"));
		}),
	);
	await actions.clickAsync(target.ref);
	expect(open()).toBe(false);
});

it("does not activate a fallback that disappears between pointer down and up", () => {
	const { tree, host, mouse, open } = fixture();
	mouse.move(4, 4);
	mouse.down();
	const summary = tree.createElement("summary");
	tree.append(summary, tree.createText("Authored"));
	tree.append(host, summary);
	mouse.up();
	expect(open()).toBe(false);
});

it("rejects a targeted generated click if mouseup inserts an authored summary", async () => {
	const { tree, host, target, mouse, actions, open } = fixture();
	const clicked = vi.fn();
	actions.events.addEventListener(host, "mouseup", () =>
		tree.append(host, tree.createElement("summary")),
	);
	actions.events.addEventListener(host, "click", clicked);
	await expect(
		mouse.clickTargetAsync(target.ref, { x: 4, y: 4 }),
	).rejects.toThrow(/no longer available|intercepts/i);
	expect(open()).toBe(false);
	expect(clicked).not.toHaveBeenCalled();
	expect(mouse.metrics().pressed).toBe(0);
});

it("does not activate when a mouseup listener moves the header away from the pointer", () => {
	const { tree, host, actions, click, open } = fixture();
	actions.events.addEventListener(host, "mouseup", () =>
		tree.setAttribute(host, "style", "position:relative;top:50px"),
	);
	click();
	expect(open()).toBe(false);
});

it("does not let ancestor anchor activation replace generated disclosure activation", () => {
	const { actions, target, open } = fixture(
		'<a href="/unexpected"><details id="host">Body</details></a>',
	);
	const result = actions.click(target.ref);
	expect(result.defaultAction).toBeUndefined();
	expect(open()).toBe(true);
});

it.each(["move", "replace"])(
	"does not fall through to ancestor navigation when mouseup %s invalidates a matched generated press",
	(change) => {
		const { tree, host, actions, click, open } = fixture(
			'<a href="/unexpected"><details id="host">Body</details></a>',
		);
		const clicked = vi.fn();
		actions.events.addEventListener(host, "click", clicked);
		actions.events.addEventListener(host, "mouseup", () => {
			if (change === "move")
				tree.setAttribute(host, "style", "position:relative;top:50px");
			else tree.append(host, tree.createElement("summary"));
		});
		const result = click();
		expect(result.defaultAction).toBeUndefined();
		expect(result.interaction).toBeUndefined();
		expect(clicked).not.toHaveBeenCalled();
		expect(open()).toBe(false);
	},
);

it("isolates nested generated activation from the outer disclosure", () => {
	const { tree, id, actions, controls, open } = fixture(
		'<details id="host" open><details id="inner">Inside</details></details>',
	);
	const inner = controls.detailsSummary(id("inner"));
	if (!inner) throw new Error("Missing inner target");
	actions.click(inner.ref);
	expect(open()).toBe(true);
	expect(tree.get(id("inner")).attributes.open).toBe("");
});

it("uses named exclusivity and the owned toggle task queue", async () => {
	const { tree, host, id, actions, target, open } = fixture(
		'<details id="host" name="group"></details><details id="peer" name="group" open></details>',
	);
	await vi.runAllTimersAsync();
	const trace: unknown[] = [];
	for (const owner of [host, id("peer")])
		actions.events.addEventListener(owner, "toggle", (event) =>
			trace.push([
				owner,
				Reflect.get(event, "oldState"),
				Reflect.get(event, "newState"),
			]),
		);
	actions.click(target.ref);
	expect(open()).toBe(true);
	expect(tree.get(id("peer")).attributes.open).toBeUndefined();
	expect(trace).toEqual([]);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([
		[host, "closed", "open"],
		[id("peer"), "open", "closed"],
	]);
});

it("prevents recursive native activation from toggling twice", () => {
	const { host, actions, target, open } = fixture();
	const callback = vi.fn(() => actions.click(target.ref));
	actions.events.addEventListener(host, "click", callback);
	actions.click(target.ref);
	expect(callback).toHaveBeenCalledTimes(1);
	expect(open()).toBe(true);
});

it.each(["hidden", "inert", "style"])(
	"rejects blocked direct generated activation through %s",
	(attribute) => {
		const { tree, host, actions, target, open } = fixture();
		tree.setAttribute(
			host,
			attribute,
			attribute === "style" ? "display:none" : "",
		);
		expect(() => actions.click(target.ref)).toThrow(/hidden|inert/i);
		expect(open()).toBe(false);
	},
);

it("does not sample body points when the header is covered", () => {
	const { point } = fixture(
		'<details id="host" open><div id="body">Body</div></details><div style="position:relative;top:-48px;height:16px;background:red"></div>',
	);
	expect(point().blocked).toBe("covered");
	expect(point().point).toBeUndefined();
});

it("checks generated button aria-disabled for clicks but not hover", async () => {
	const { tree, host, target, mouse, point, open } = fixture();
	tree.setAttribute(host, "aria-disabled", "true");
	expect(point().blocked).toBe("aria-disabled");
	expect(point(true).point).toBeDefined();
	await expect(
		mouse.clickTargetAsync(target.ref, { x: 4, y: 4 }),
	).rejects.toThrow(/disabled/i);
	await mouse.hoverTargetAsync(target.ref, { x: 4, y: 4 });
	expect(open()).toBe(false);
});

it("releases generated press state when a targeted sequence is aborted", async () => {
	const { host, mouse, actions, target, open } = fixture();
	const controller = new AbortController();
	actions.events.addEventListener(
		host,
		"mousedown",
		controlledEventListener(async () => {
			controller.abort();
		}),
	);
	await expect(
		mouse.clickTargetAsync(target.ref, { x: 4, y: 4 }, controller.signal),
	).rejects.toThrow(/abort/i);
	expect(mouse.metrics()).toMatchObject({
		pressed: 0,
		buttons: 0,
		busy: false,
	});
	mouse.up();
	expect(open()).toBe(false);
});

it("rejects foreign and closed generated references without dispatch", () => {
	const first = fixture();
	const second = fixture();
	expect(() => first.actions.click(second.target.ref)).toThrow(
		/no longer available/i,
	);
	first.actions.close();
	expect(() => first.actions.click(first.target.ref)).toThrow(/closed/i);
});

it("preserves state on toggle queue exhaustion and releases its activation guard for retry", async () => {
	const { tree, actions, target, open } = fixture();
	for (let index = 0; index < 512; index++)
		tree.createElement("details", { open: "" });
	expect(() => actions.click(target.ref)).toThrow(/notification limit/i);
	expect(open()).toBe(false);
	await vi.runAllTimersAsync();
	actions.click(target.ref);
	expect(open()).toBe(true);
});
