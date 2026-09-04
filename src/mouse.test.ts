import { afterEach, expect, it, vi } from "vitest";
import { controlChecked } from "./controls.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { BrowserMouseEvent, mouseLimits, type MouseButton } from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import type { DocumentTree } from "./document.js";

const documents: DocumentTree[] = [];
function fixture(
	content = '<div id="first" tabindex="0"></div><div id="second" tabindex="0"></div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}main{width:100px;font-size:8px;line-height:12px}#first,#second{display:block;width:40px;height:20px}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/mouse",
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
	const events: BrowserMouseEvent[] = [];
	for (const type of [
		"mouseover",
		"mouseout",
		"mouseenter",
		"mouseleave",
		"mousemove",
		"mousedown",
		"mouseup",
		"click",
		"auxclick",
		"contextmenu",
	])
		actions.events.addEventListener(
			tree.root,
			type,
			(event) => {
				if (event instanceof BrowserMouseEvent) events.push(event);
			},
			{ capture: true },
		);
	return { tree, actions, mouse: actions.mouse, id, events };
}
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

it.each(["button", "span"])(
	"rejects an injected implicitly inert mouse target %s",
	(target) => {
		const { tree, mouse, id, events } = fixture(
			"<select><button><span>Choice</span></button></select>",
		);
		vi.spyOn(documentHitTesting(tree), "elementFromPoint").mockReturnValue(
			id(target),
		);
		expect(mouse.move(5, 5).reference).toBeNull();
		expect(mouse.down().reference).toBeNull();
		expect(mouse.up().reference).toBeNull();
		expect(events).toEqual([]);
		expect(mouse.metrics().buttons).toBe(0);
	},
);

it("rechecks injected mouse targets after first-child mutations", () => {
	const { tree, mouse, id } = fixture(
		'<select><div id="prefix"></div><button><span>Choice</span></button></select>',
	);
	vi.spyOn(documentHitTesting(tree), "elementFromPoint").mockReturnValue(
		id("span"),
	);
	expect(mouse.move(5, 5).reference).toBe(tree.reference(id("span")));
	tree.remove(id("#prefix"));
	expect(mouse.move(5, 5).reference).toBeNull();
});

it("releases a pressed button without activating a newly inert injected target", () => {
	const { tree, mouse, id, events } = fixture(
		'<select><div id="prefix"></div><button><span>Choice</span></button></select>',
	);
	vi.spyOn(documentHitTesting(tree), "elementFromPoint").mockReturnValue(
		id("span"),
	);
	mouse.move(5, 5);
	mouse.down();
	tree.remove(id("#prefix"));
	expect(mouse.up().reference).toBeNull();
	expect(events.some((event) => event.type === "click")).toBe(false);
	expect(mouse.metrics().buttons).toBe(0);
});

it("allows mouse targeting of the select owner rather than its inert child", () => {
	const { tree, mouse, id } = fixture(
		"<select><button><span>Choice</span></button></select>",
	);
	vi.spyOn(documentHitTesting(tree), "elementFromPoint").mockReturnValue(
		id("select"),
	);
	expect(mouse.move(5, 5).reference).toBe(tree.reference(id("select")));
});

it("moves with viewport coordinates, delta and boundary events", () => {
	const { mouse, id, events } = fixture();
	expect(mouse.move(5, 6)).toMatchObject({
		x: 5,
		y: 6,
		buttons: 0,
		canceled: false,
	});
	expect(
		events
			.filter((event) => event.target === id("#first"))
			.map((event) => event.type),
	).toEqual(["mouseover", "mouseenter", "mousemove"]);
	expect(events.at(-1)).toMatchObject({
		clientX: 5,
		clientY: 6,
		pageX: 5,
		pageY: 6,
		movementX: 5,
		movementY: 6,
		buttons: 0,
	});
	mouse.move(8, 6);
	expect(events.at(-1)).toMatchObject({ movementX: 3, movementY: 0 });
});

it("crosses siblings without exiting and reentering shared ancestors", () => {
	const { mouse, events, id } = fixture();
	mouse.move(5, 5);
	events.length = 0;
	mouse.move(5, 25);
	expect(events.map((event) => [event.type, event.target])).toEqual([
		["mouseout", id("#first")],
		["mouseleave", id("#first")],
		["mouseover", id("#second")],
		["mouseenter", id("#second")],
		["mousemove", id("#second")],
	]);
	expect(events[0].relatedTarget).toBe(id("#second"));
	expect(events[2].relatedTarget).toBe(id("#first"));
	expect(events[1]).toMatchObject({
		bubbles: false,
		cancelable: false,
		composed: false,
	});
});

it("dispatches button state before listeners, focuses on down, and activates on up", () => {
	const { mouse, actions, events, id } = fixture();
	mouse.move(5, 5);
	events.length = 0;
	expect(mouse.down().buttons).toBe(1);
	expect(actions.focus.active()).toBe(id("#first"));
	expect(events.map((event) => event.type)).toEqual(["mousedown"]);
	expect(mouse.up().interaction?.defaultPrevented).toBe(false);
	expect(
		events.map((event) => [
			event.type,
			event.button,
			event.buttons,
			event.detail,
		]),
	).toEqual([
		["mousedown", 0, 1, 1],
		["mouseup", 0, 0, 1],
		["click", 0, 0, 1],
	]);
});

it("canceled mousedown suppresses focus but does not suppress a later click", () => {
	const { mouse, actions, events, id } = fixture();
	actions.events.addEventListener(id("#first"), "mousedown", (event) =>
		event.preventDefault(),
	);
	mouse.move(5, 5);
	expect(mouse.down().canceled).toBe(true);
	expect(actions.focus.active()).toBeNull();
	mouse.up();
	expect(events.at(-1)?.type).toBe("click");
});

it("canceled mouseup still dispatches click and its default action", () => {
	const { mouse, actions, id } = fixture('<a id="first" href="/next">Next</a>');
	actions.events.addEventListener(id("#first"), "mouseup", (event) =>
		event.preventDefault(),
	);
	mouse.move(5, 5);
	mouse.down();
	expect(mouse.up()).toMatchObject({
		canceled: true,
		buttons: 0,
		defaultAction: { kind: "navigate", url: "https://fixture.invalid/next" },
	});
});

it("canceled click prevents link navigation", () => {
	const { mouse, actions, id } = fixture('<a id="first" href="/next">Next</a>');
	actions.events.addEventListener(id("#first"), "click", (event) =>
		event.preventDefault(),
	);
	mouse.move(5, 5);
	mouse.down();
	expect(mouse.up()).toMatchObject({
		canceled: true,
		interaction: { defaultPrevented: true },
	});
	expect(mouse.up().defaultAction).toBeUndefined();
});

it("uses the common ancestor for a press released over a sibling", () => {
	const { mouse, events, id } = fixture();
	mouse.move(5, 5);
	mouse.down();
	mouse.move(5, 25);
	mouse.up();
	expect(events.at(-1)).toMatchObject({ type: "click", target: id("main") });
});

it("does not click when the pressed target is removed", () => {
	const { tree, mouse, events, id } = fixture();
	mouse.move(5, 5);
	mouse.down();
	tree.remove(id("#first"));
	mouse.up();
	expect(events.filter((event) => event.type === "click")).toEqual([]);
	expect(mouse.metrics().buttons).toBe(0);
});

it("does not click after a mouseup listener removes the pressed target", () => {
	const { tree, mouse, actions, events, id } = fixture();
	actions.events.addEventListener(id("#first"), "mouseup", () =>
		tree.remove(id("#first")),
	);
	mouse.move(5, 5);
	mouse.down();
	mouse.up();
	expect(events.filter((event) => event.type === "click")).toEqual([]);
});

it("an unheld mouseup emits no click and an outside release clears the hold", () => {
	const { mouse, events } = fixture();
	mouse.move(5, 5);
	mouse.up();
	expect(events.at(-1)?.type).toBe("mouseup");
	mouse.down();
	mouse.move(-1, -1);
	expect(mouse.up()).toMatchObject({ reference: null, buttons: 0 });
	expect(events.filter((event) => event.type === "click")).toEqual([]);
});

it.each(["middle", "right"] as const)(
	"supports %s state and auxclick without inventing auxiliary navigation",
	(button) => {
		const { mouse, events, actions } = fixture();
		mouse.move(5, 5);
		mouse.down(button);
		expect(actions.focus.active()).toBeNull();
		expect(mouse.up(button).defaultAction).toBeUndefined();
		expect(events.at(-1)).toMatchObject({
			type: "auxclick",
			button: button === "middle" ? 1 : 2,
			buttons: 0,
		});
		expect(events.some((event) => event.type === "contextmenu")).toBe(
			button === "right",
		);
	},
);

it("holds multiple buttons independently and rejects duplicate down", () => {
	const { mouse } = fixture();
	mouse.move(5, 5);
	mouse.down();
	expect(mouse.down("middle").buttons).toBe(5);
	expect(mouse.down("right").buttons).toBe(7);
	expect(() => mouse.down("left")).toThrow("already held");
	expect(mouse.up("middle").buttons).toBe(3);
	expect(mouse.up("left").buttons).toBe(2);
	expect(mouse.up("right").buttons).toBe(0);
});

it("shares keyboard modifiers and keeps event snapshots immutable", () => {
	const { mouse, actions, events } = fixture();
	actions.keyboard.down("Control");
	actions.keyboard.down("Shift");
	mouse.move(5, 5);
	mouse.down();
	const event = events.at(-1) as BrowserMouseEvent;
	expect(event).toMatchObject({ ctrlKey: true, shiftKey: true });
	expect(event.getModifierState("Control")).toBe(true);
	expect(event.getModifierState("CapsLock")).toBe(false);
	actions.keyboard.up("Shift");
	actions.keyboard.up("Control");
	mouse.up();
	expect(event.ctrlKey).toBe(true);
	expect(events.at(-1)?.ctrlKey).toBe(false);
});

it("activates a rendered label's CSS-hidden checkbox through the existing native pipeline", () => {
	const { tree, mouse, id } = fixture(
		'<input id="check" type="checkbox" style="display:none"><label id="first" for="check">Check</label>',
	);
	mouse.move(5, 5);
	mouse.down();
	expect(controlChecked(tree, id("#check"))).toBe(false);
	expect(mouse.up().interaction?.label?.forwarded).toBe(true);
	expect(controlChecked(tree, id("#check"))).toBe(true);
});

it("re-hits after a boundary listener changes layout before the down event", () => {
	const { tree, mouse, actions, id, events } = fixture();
	actions.events.addEventListener(
		id("#first"),
		"mouseover",
		() => tree.setAttribute(id("#first"), "style", "display:none"),
		{ once: true },
	);
	mouse.move(5, 5);
	mouse.down();
	expect(events.at(-1)).toMatchObject({
		type: "mousedown",
		target: id("#second"),
	});
});

it("bounds hover churn without retaining a button or an active action", () => {
	const { tree, mouse, actions, id } = fixture();
	actions.events.addEventListener(id("#first"), "mouseover", () =>
		tree.setAttribute(id("#first"), "style", "display:none"),
	);
	actions.events.addEventListener(id("#second"), "mouseover", () =>
		tree.removeAttribute(id("#first"), "style"),
	);
	expect(() => mouse.down()).toThrow("did not stabilize");
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it("rejects overlapping native actions instead of corrupting mouse state", () => {
	const { mouse, actions, id } = fixture();
	let reentrant: unknown;
	actions.events.addEventListener(id("#first"), "mousedown", () => {
		try {
			mouse.up();
		} catch (error) {
			reentrant = error;
		}
	});
	mouse.move(5, 5);
	mouse.down();
	expect(reentrant).toMatchObject({ code: "not-actionable" });
	expect(mouse.metrics().buttons).toBe(1);
	mouse.up();
});

it("clears a released button even if fresh hit testing fails", () => {
	const { tree, mouse, id } = fixture();
	mouse.move(5, 5);
	mouse.down();
	tree.setAttribute(id("#first"), "style", "position:sticky");
	expect(() => mouse.up()).toThrow();
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it("excludes inert regions and invalidates the exclusion when the attribute changes", () => {
	const { tree, mouse, id } = fixture();
	tree.setAttribute(id("#first"), "inert", "");
	expect(documentHitTesting(tree).elementsFromPoint(5, 5)).not.toContain(
		id("#first"),
	);
	expect(mouse.move(5, 5).reference).toBe(tree.reference(id("main")));
	tree.removeAttribute(id("#first"), "inert");
	expect(mouse.move(5, 5).reference).toBe(tree.reference(id("#first")));
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, "5"])(
	"rejects invalid coordinate %s before movement",
	(coordinate) => {
		const { mouse, events } = fixture();
		expect(() => mouse.move(coordinate as number, 1)).toThrow();
		expect(mouse.metrics()).toMatchObject({ x: 0, y: 0, buttons: 0 });
		expect(events).toEqual([]);
	},
);

it.each(["back", "__proto__", "LEFT", ""])(
	"rejects unsupported button %s without state changes",
	(button) => {
		const { mouse } = fixture();
		expect(() => mouse.down(button as MouseButton)).toThrow("Expected left");
		expect(mouse.metrics().buttons).toBe(0);
	},
);

it("isolates documents and releases buttons on interaction/document close", () => {
	const first = fixture();
	const second = fixture();
	first.mouse.move(5, 5);
	first.mouse.down();
	expect(second.mouse.metrics().buttons).toBe(0);
	first.actions.close();
	expect(first.mouse.metrics()).toMatchObject({ closed: true, buttons: 0 });
	expect(() => first.mouse.up()).toThrow("closed");
	second.tree.close();
	expect(() => second.mouse.move(1, 1)).toThrow("closed");
});

it("keeps native-control rendering gaps explicit instead of inventing coordinate boxes", () => {
	const { mouse } = fixture('<input id="first" type="range">');
	expect(() => mouse.move(5, 5)).toThrow("supported formatting profile");
});

it("bounds lifetime mouse actions even for off-viewport coordinates", () => {
	const { mouse } = fixture();
	for (let index = 0; index < mouseLimits.maxActions; index++)
		mouse.move(-1, -1);
	expect(() => mouse.move(-1, -1)).toThrow("Mouse action limit");
	expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
});

it("cleans up held state when a listener closes the document during down", () => {
	const { tree, mouse, actions, id } = fixture();
	actions.events.addEventListener(id("#first"), "mousedown", () =>
		tree.close(),
	);
	mouse.move(5, 5);
	expect(() => mouse.down()).toThrow("closed");
	expect(mouse.metrics()).toMatchObject({
		closed: true,
		buttons: 0,
		busy: false,
	});
});

it.each(["Shift", "Control", "Meta", "Alt"])(
	"does not turn %s-click into ordinary same-tab navigation",
	(modifier) => {
		const { mouse, actions, events } = fixture(
			'<a id="first" href="/next">Next</a>',
		);
		actions.keyboard.down(modifier);
		mouse.move(5, 5);
		mouse.down();
		expect(() => mouse.up()).toThrow("Modified mouse link navigation");
		expect(events.at(-1)?.type).toBe("click");
		expect(mouse.metrics()).toMatchObject({ buttons: 0, busy: false });
	},
);

it("reports unsupported middle-link navigation after dispatch and honors auxclick cancellation", () => {
	const { mouse, actions, id } = fixture('<a id="first" href="/next">Next</a>');
	mouse.move(5, 5);
	mouse.down("middle");
	expect(() => mouse.up("middle")).toThrow("Auxiliary mouse link navigation");
	actions.events.addEventListener(id("#first"), "auxclick", (event) =>
		event.preventDefault(),
	);
	mouse.down("middle");
	expect(mouse.up("middle").canceled).toBe(true);
});
