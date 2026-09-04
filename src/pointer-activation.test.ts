import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	BrowserMouseEvent,
	BrowserPointerActivationEvent,
	mouseCapabilities,
	type MouseButton,
} from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const state = {
	x: 4.5,
	y: 6.75,
	pageX: 14.5,
	pageY: 26.75,
	button: 0,
	buttons: 0,
	shift: false,
	control: false,
	alt: false,
	meta: false,
};
const defaults = {
	width: 1,
	height: 1,
	pressure: 0,
	tangentialPressure: 0,
	tiltX: 0,
	tiltY: 0,
	twist: 0,
	altitudeAngle: Math.PI / 2,
	azimuthAngle: 0,
	isPrimary: false,
	persistentDeviceId: 0,
};
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = parseHtmlDocument(
		"<style>html,body{margin:0;padding:0}button{display:block;width:40px;height:20px}</style><button>Activate</button>",
		"https://fixture.invalid/pointer-activation",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("button");
	if (target === null) throw new Error("Missing target");
	const events: BrowserEvent[] = [];
	for (const type of [
		"click",
		"auxclick",
		"contextmenu",
		"mousedown",
		"mouseup",
		"mousemove",
	])
		actions.events.addEventListener(target, type, (event) =>
			events.push(event),
		);
	return { tree, actions, target, events };
}

for (const type of ["click", "auxclick", "contextmenu"] as const) {
	it.each(["mouse", "non-pointer"] as const)(
		`${type} uses default pointer attributes for %s input`,
		(source) => {
			const event = new BrowserPointerActivationEvent(type, state, source);
			expect(event).toBeInstanceOf(BrowserMouseEvent);
			expect(event).toBeInstanceOf(BrowserEvent);
			expect(event).toMatchObject({
				...defaults,
				type,
				pointerId: source === "mouse" ? 1 : -1,
				pointerType: source === "mouse" ? "mouse" : "",
				bubbles: true,
				cancelable: true,
				composed: true,
				isTrusted: false,
			});
		},
	);
}

it("preserves the existing shared fractional MouseEvent coordinate profile", () => {
	const event = new BrowserPointerActivationEvent("click", state, "mouse");
	expect(event).toMatchObject({
		clientX: 4.5,
		clientY: 6.75,
		pageX: 14.5,
		pageY: 26.75,
		x: 4.5,
		y: 6.75,
	});
});

it("does not turn pressed mouse buttons into pressure or primary-pointer flags on activation events", () => {
	const event = new BrowserPointerActivationEvent(
		"contextmenu",
		{ ...state, button: 2, buttons: 2 },
		"mouse",
	);
	expect(event).toMatchObject({
		...defaults,
		buttons: 2,
		button: 2,
		pointerId: 1,
		pointerType: "mouse",
	});
});

it.each(Object.keys(defaults))(
	"does not allow assignment to pointer field %s",
	(property) => {
		const event = new BrowserPointerActivationEvent("click", state, "mouse");
		expect(Reflect.set(event, property, 123)).toBe(false);
		expect(event).toMatchObject(defaults);
	},
);

it("rejects unsupported native event/source profiles", () => {
	expect(
		() =>
			new BrowserPointerActivationEvent(
				"pointerdown" as "click",
				state,
				"mouse",
			),
	).toThrow("Invalid pointer activation");
	expect(
		() => new BrowserPointerActivationEvent("click", state, "touch" as "mouse"),
	).toThrow("Invalid pointer activation");
});

it.each(["left", "middle", "right"] as MouseButton[])(
	"adds mouse pointer metadata to %s-button activation without changing down/up events",
	(button) => {
		const { actions, events } = fixture();
		actions.mouse.move(5, 5);
		actions.mouse.down(button);
		actions.mouse.up(button);
		const activations = events.filter(
			(event) => event instanceof BrowserPointerActivationEvent,
		);
		expect(activations.map((event) => event.type)).toEqual(
			button === "left"
				? ["click"]
				: button === "middle"
					? ["auxclick"]
					: ["contextmenu", "auxclick"],
		);
		for (const event of activations)
			expect(event).toMatchObject({
				...defaults,
				pointerId: 1,
				pointerType: "mouse",
			});
		for (const event of events.filter((event) =>
			["mousemove", "mousedown", "mouseup"].includes(event.type),
		)) {
			expect(event).toBeInstanceOf(BrowserMouseEvent);
			expect(event).not.toBeInstanceOf(BrowserPointerActivationEvent);
		}
	},
);

it("uses non-pointer identity for host programmatic, agent and keyboard activation", () => {
	const { tree, actions, target, events } = fixture();
	actions.programmaticClick(target);
	actions.click(tree.reference(target));
	actions.focus.focus(tree.reference(target));
	actions.keyboard.press("Enter");
	actions.keyboard.press("Space");
	expect(events).toHaveLength(4);
	for (const event of events) {
		expect(event).toBeInstanceOf(BrowserPointerActivationEvent);
		expect(event).toMatchObject({
			...defaults,
			pointerId: -1,
			pointerType: "",
			detail: 0,
		});
	}
});

it("does not promote arbitrary manually dispatched click events", () => {
	const { actions, target, events } = fixture();
	const manual = new BrowserEvent("click");
	actions.events.dispatchEvent(target, manual);
	expect(events).toEqual([manual]);
	expect(manual).not.toBeInstanceOf(BrowserPointerActivationEvent);
});

it("keeps pointer-stream and activation-field capability claims distinct", () => {
	expect(mouseCapabilities).toMatchObject({
		pointerEvents: false,
		pointerActivationFields: true,
		constructors: false,
		trustedEvents: false,
	});
});
