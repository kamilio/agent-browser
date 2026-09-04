import { afterEach, expect, it } from "vitest";
import { findClickPoint, findGeneratedClickPoint } from "./click-target.js";
import { controlChecked } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { controlledEventListener } from "./events.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { BrowserMouseEvent, BrowserPointerActivationEvent } from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content = '<button id="target">Go</button>', css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target{display:block;width:40px;height:20px}#overlay{position:relative;top:-20px;width:40px;height:20px;z-index:1}${css}</style>${content}`,
		"https://fixture.invalid/start",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const reference = tree.reference(target);
	const events: BrowserMouseEvent[] = [];
	for (const type of ["mousemove", "mousedown", "mouseup", "click", "dblclick"])
		actions.events.addEventListener(tree.root, type, (event) => {
			if (event instanceof BrowserMouseEvent) events.push(event);
		});
	const point = findClickPoint(tree, target).point ?? { x: 5, y: 5 };
	return {
		tree,
		actions,
		mouse: actions.mouse,
		id,
		target,
		reference,
		events,
		point,
	};
}

function gate() {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}

it("dispatches two native clicks followed by a mouse dblclick with correct counts", async () => {
	const { mouse, actions, tree, target, reference, events, point } = fixture();
	const result = await mouse.doubleClickTargetAsync(reference, point);
	expect(
		events.map((event) => [event.type, event.detail, event.buttons]),
	).toEqual([
		["mousemove", 0, 0],
		["mousedown", 1, 1],
		["mouseup", 1, 0],
		["click", 1, 0],
		["mousedown", 2, 1],
		["mouseup", 2, 0],
		["click", 2, 0],
		["dblclick", 2, 0],
	]);
	expect(events.every((event) => event.target === target)).toBe(true);
	expect(
		events
			.filter((event) => event.type === "click")
			.every((event) => event instanceof BrowserPointerActivationEvent),
	).toBe(true);
	expect(events.at(-1)).not.toBeInstanceOf(BrowserPointerActivationEvent);
	expect(events.at(-1)).toMatchObject({
		bubbles: true,
		cancelable: true,
		composed: true,
		button: 0,
		clientX: point.x,
		clientY: point.y,
	});
	expect(result).toMatchObject({
		clicks: [
			{ interaction: { defaultPrevented: false } },
			{ interaction: { defaultPrevented: false } },
		],
		doubleClick: { canceled: false, buttons: 0 },
		canceled: false,
	});
	expect(actions.focus.active()).toBe(target);
	expect(tree.activeElement).toBe(target);
	expect(mouse.metrics()).toMatchObject({
		buttons: 0,
		pressed: 0,
		busy: false,
		actions: 1,
	});
});

it("uses the native checkbox default twice, not a third activation for dblclick", async () => {
	const { mouse, actions, tree, target, reference, point } = fixture(
		'<input id="target" type="checkbox">',
	);
	const states: boolean[] = [];
	const changes: string[] = [];
	actions.events.addEventListener(target, "click", () =>
		states.push(controlChecked(tree, target)),
	);
	for (const type of ["input", "change"])
		actions.events.addEventListener(target, type, () => changes.push(type));
	await mouse.doubleClickTargetAsync(reference, point);
	expect(states).toEqual([true, false]);
	expect(changes).toEqual(["input", "change", "input", "change"]);
	expect(controlChecked(tree, target)).toBe(false);
});

it.each(["mousedown", "mouseup", "click", "dblclick"])(
	"preserves %s cancellation without suppressing later clicks",
	async (type) => {
		const { mouse, actions, tree, target, reference, events, point } = fixture(
			'<input id="target" type="checkbox">',
		);
		actions.events.addEventListener(target, type, (event) =>
			event.preventDefault(),
		);
		const result = await mouse.doubleClickTargetAsync(reference, point);
		expect(
			events
				.filter((event) => event.type === "click")
				.map((event) => event.detail),
		).toEqual([1, 2]);
		expect(events.at(-1)?.type).toBe("dblclick");
		expect(result.canceled).toBe(true);
		expect(result.doubleClick?.canceled).toBe(type === "dblclick");
		expect(
			result.clicks.map((click) => click.interaction?.defaultPrevented),
		).toEqual([type === "click", type === "click"]);
		if (type === "mousedown") expect(tree.activeElement).toBeNull();
		expect(controlChecked(tree, target)).toBe(false);
	},
);

it("rolls back only the canceled checkbox click", async () => {
	const { mouse, actions, tree, target, reference, point } = fixture(
		'<input id="target" type="checkbox">',
	);
	actions.events.addEventListener(target, "click", (event) => {
		if ((event as BrowserMouseEvent).detail === 2) event.preventDefault();
	});
	const result = await mouse.doubleClickTargetAsync(reference, point);
	expect(controlChecked(tree, target)).toBe(true);
	expect(result.clicks.map((click) => click.canceled)).toEqual([false, true]);
	expect(result.doubleClick).toBeDefined();
});

it.each(["disabled", "inert", "aria-disabled", "hidden", "covered"])(
	"rejects an initially %s target before pointer dispatch",
	async (blocked) => {
		const { mouse, tree, id, target, reference, events, point } = fixture(
			'<button id="target">Go</button><div id="overlay" hidden></div>',
		);
		if (blocked === "covered") tree.removeAttribute(id("#overlay"), "hidden");
		else
			tree.setAttribute(
				target,
				blocked,
				blocked === "aria-disabled" ? "true" : "",
			);
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toMatchObject({ code: "not-actionable" });
		expect(events).toEqual([]);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it.each(["mousemove", "mousedown", "focus", "mouseup", "click"])(
	"stops after %s disables the target",
	async (type) => {
		const { mouse, actions, tree, target, reference, events, point } =
			fixture();
		actions.events.addEventListener(target, type, () =>
			tree.setAttribute(target, "disabled", ""),
		);
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toMatchObject({ code: "not-actionable" });
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			type === "click" ? 1 : 0,
		);
		expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(mouse.metrics()).toMatchObject({
			buttons: 0,
			pressed: 0,
			busy: false,
		});
	},
);

it.each(["remove", "cover", "inert", "hidden", "aria-disabled"])(
	"does not replay or continue when the first click causes %s",
	async (mutation) => {
		const { mouse, actions, tree, id, target, reference, events, point } =
			fixture('<button id="target">Go</button><div id="overlay" hidden></div>');
		actions.events.addEventListener(target, "click", () => {
			if (mutation === "remove") tree.remove(target);
			else if (mutation === "cover")
				tree.removeAttribute(id("#overlay"), "hidden");
			else
				tree.setAttribute(
					target,
					mutation,
					mutation === "aria-disabled" ? "true" : "",
				);
		});
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(events.filter((event) => event.type === "click")).toHaveLength(1);
		expect(events.filter((event) => event.type === "mousedown")).toHaveLength(
			1,
		);
		expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it.each(["mousedown", "mouseup", "click"])(
	"stops a changed descendant hit after %s instead of switching targets",
	async (type) => {
		const { mouse, actions, tree, id, target, reference, events, point } =
			fixture(
				'<div id="target"><span id="child">Child</span></div>',
				"#child{display:block;width:40px;height:20px}",
			);
		expect(events).toEqual([]);
		actions.events.addEventListener(target, type, () =>
			tree.setAttribute(id("#child"), "style", "display:none"),
		);
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toThrow("hit target changed");
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			type === "click" ? 1 : 0,
		);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it.each(["mousedown", "mouseup", "click"])(
	"checks second-click %s mutations before later phases",
	async (type) => {
		const { mouse, actions, tree, target, reference, events, point } =
			fixture();
		actions.events.addEventListener(target, type, (event) => {
			if ((event as BrowserMouseEvent).detail === 2)
				tree.setAttribute(target, "disabled", "");
		});
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toMatchObject({ code: "not-actionable" });
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			type === "click" ? 2 : 1,
		);
		expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it("rejects a reference from another document without dispatch", async () => {
	const first = fixture();
	const second = fixture();
	await expect(
		second.mouse.doubleClickTargetAsync(first.reference, second.point),
	).rejects.toMatchObject({ code: "stale-reference" });
	expect(second.events).toEqual([]);
	expect(second.mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it.each(["left", "middle", "right"] as const)(
	"does not steal an already held %s button",
	async (button) => {
		const { mouse, reference, point } = fixture();
		mouse.move(point.x, point.y);
		mouse.down(button);
		const held = mouse.metrics().buttons;
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toThrow("held mouse buttons");
		expect(mouse.metrics()).toMatchObject({ buttons: held, busy: false });
		mouse.up(button);
	},
);

it("rejects reentrant pointer changes during focus without moving focus back", async () => {
	const { mouse, actions, tree, id, target, reference, events, point } =
		fixture('<button id="target">Go</button><input id="other">');
	actions.events.addEventListener(target, "focus", () => {
		expect(() => mouse.down("right")).toThrow("Another mouse action");
		actions.focus.focus(tree.reference(id("#other")));
	});
	await mouse.doubleClickTargetAsync(reference, point);
	expect(actions.focus.active()).toBe(id("#other"));
	expect(actions.events.metrics().retainedErrors).toBe(0);
	expect(events.at(-1)?.type).toBe("dblclick");
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it.each(["mousedown", "focus", "mouseup", "click", "dblclick"])(
	"checks external document ownership after %s",
	async (type) => {
		const { mouse, actions, target, reference, events, point } = fixture();
		let current = true;
		actions.events.addEventListener(target, type, () => {
			current = false;
		});
		await expect(
			mouse.doubleClickTargetAsync(reference, point, {
				checkOwnership() {
					if (!current)
						throw new AgentBrowserError("stale-reference", "Document replaced");
				},
			}),
		).rejects.toMatchObject({ code: "stale-reference" });
		if (type !== "dblclick")
			expect(events.some((event) => event.type === "dblclick")).toBe(false);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it("stops when a click closes the document", async () => {
	const { mouse, actions, tree, target, reference, point } = fixture();
	let clicks = 0;
	actions.events.addEventListener(target, "click", () => {
		clicks++;
		tree.close();
	});
	await expect(
		mouse.doubleClickTargetAsync(reference, point),
	).rejects.toMatchObject({ code: "closed" });
	expect(clicks).toBe(1);
	expect(mouse.metrics()).toMatchObject({
		buttons: 0,
		busy: false,
		closed: true,
	});
});

it.each([1, 2])(
	"aborts a suspended mousedown %s and rejects concurrent gestures",
	async (detail) => {
		const { mouse, actions, target, reference, events, point } = fixture();
		const entered = gate();
		const waiting = gate();
		const controller = new AbortController();
		actions.events.addEventListener(
			target,
			"mousedown",
			controlledEventListener(async (_target, event) => {
				if ((event as BrowserMouseEvent).detail !== detail) return;
				entered.release();
				await waiting.pending;
			}),
		);
		const pending = mouse.doubleClickTargetAsync(reference, point, {
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		await entered.pending;
		expect(() => mouse.move(10, 10)).toThrow("Another mouse action");
		await expect(
			mouse.doubleClickTargetAsync(reference, point),
		).rejects.toThrow("Another mouse action");
		expect(mouse.metrics().buttons).toBe(1);
		controller.abort();
		await rejected;
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			detail - 1,
		);
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
		waiting.release();
	},
);

it("rolls back native checkbox preactivation when a suspended click aborts", async () => {
	const { mouse, actions, tree, target, reference, point } = fixture(
		'<input id="target" type="checkbox">',
	);
	const entered = gate();
	const waiting = gate();
	const controller = new AbortController();
	actions.events.addEventListener(
		target,
		"click",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = mouse.doubleClickTargetAsync(reference, point, {
		signal: controller.signal,
	});
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered.pending;
	expect(controlChecked(tree, target)).toBe(true);
	controller.abort();
	await rejected;
	expect(controlChecked(tree, target)).toBe(false);
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	waiting.release();
});

it("rejects pre-aborted input without reserving or dispatching", async () => {
	const { mouse, reference, events, point } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		mouse.doubleClickTargetAsync(reference, point, {
			signal: controller.signal,
		}),
	).rejects.toMatchObject({ code: "aborted" });
	expect(events).toEqual([]);
	expect(mouse.metrics()).toMatchObject({
		buttons: 0,
		busy: false,
		actions: 0,
	});
});

it("leaves ordinary clicks and raw mouse actions at detail one", async () => {
	const { mouse, reference, events, point } = fixture();
	await mouse.doubleClickTargetAsync(reference, point);
	events.length = 0;
	await mouse.clickTargetAsync(reference, point);
	mouse.down();
	mouse.up();
	expect(
		events
			.filter((event) => event.type !== "mousemove")
			.every((event) => event.detail === 1),
	).toBe(true);
});

it("preserves generated summary ownership and toggles details twice", async () => {
	const { mouse, tree, target, events } = fixture(
		'<details id="target"><div>Body</div></details>',
	);
	const generated = documentGeneratedControls(tree).detailsSummary(target);
	if (!generated) throw new Error("Missing generated summary");
	const point = findGeneratedClickPoint(tree, generated.ref).point;
	if (!point) throw new Error("Missing generated point");
	const result = await mouse.doubleClickTargetAsync(generated.ref, point);
	expect(result.clicks.map((click) => click.interaction?.reference)).toEqual([
		generated.ref,
		generated.ref,
	]);
	expect(Object.hasOwn(tree.get(target).attributes, "open")).toBe(false);
	expect(events.at(-1)).toMatchObject({ type: "dblclick", target, detail: 2 });
	expect(tree.pointerActiveElement).toBeNull();
});

it("does not replace a generated summary with a newly inserted DOM summary", async () => {
	const { mouse, actions, tree, target, events } = fixture(
		'<details id="target"><summary id="replacement" hidden>Replacement</summary><div>Body</div></details>',
	);
	const replacement = new DocumentQueries(tree).querySelector("#replacement");
	if (replacement === null) throw new Error("Missing summary");
	tree.remove(replacement);
	const generated = documentGeneratedControls(tree).detailsSummary(target);
	if (!generated) throw new Error("Missing generated summary");
	const point = findGeneratedClickPoint(tree, generated.ref).point;
	if (!point) throw new Error("Missing generated point");
	actions.events.addEventListener(target, "click", () => {
		tree.removeAttribute(replacement, "hidden");
		tree.append(target, replacement);
	});
	await expect(
		mouse.doubleClickTargetAsync(generated.ref, point),
	).rejects.toBeInstanceOf(AgentBrowserError);
	expect(events.filter((event) => event.type === "mousedown")).toHaveLength(1);
	expect(events.some((event) => event.type === "dblclick")).toBe(false);
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it("retains native label forwarding without treating its control click as the second click", async () => {
	const { mouse, tree, id, reference, events, point } = fixture(
		'<input id="control" type="checkbox" style="display:none"><label id="target" for="control">Check</label>',
	);
	const result = await mouse.doubleClickTargetAsync(reference, point);
	expect(
		result.clicks.map((click) => click.interaction?.label?.forwarded),
	).toEqual([true, true]);
	expect(controlChecked(tree, id("#control"))).toBe(false);
	expect(
		events
			.filter((event) => event.type === "click")
			.map((event) => event.detail),
	).toEqual([1, 0, 2, 0]);
	expect(events.at(-1)?.type).toBe("dblclick");
});

it("keeps the selected point stable even when a listener mutates the caller's point", async () => {
	const { mouse, actions, target, reference, events, point } = fixture();
	const supplied = { ...point };
	actions.events.addEventListener(target, "click", () => {
		supplied.x = 90;
		supplied.y = 70;
	});
	await mouse.doubleClickTargetAsync(reference, supplied);
	expect(
		events.every(
			(event) => event.clientX === point.x && event.clientY === point.y,
		),
	).toBe(true);
});

it("does not retroactively reject a dblclick that disables its target", async () => {
	const { mouse, actions, tree, target, reference, point } = fixture();
	actions.events.addEventListener(target, "dblclick", () =>
		tree.setAttribute(target, "disabled", ""),
	);
	expect(
		(await mouse.doubleClickTargetAsync(reference, point)).doubleClick,
	).toBeDefined();
	expect(tree.pointerActiveElement).toBeNull();
});

it("copies held modifiers into both clicks and the final dblclick", async () => {
	const { mouse, actions, reference, events, point } = fixture();
	actions.keyboard.down("Shift");
	await mouse.doubleClickTargetAsync(reference, point);
	expect(events.every((event) => event.shiftKey)).toBe(true);
	expect(events.at(-1)?.getModifierState("Shift")).toBe(true);
	actions.keyboard.up("Shift");
});
