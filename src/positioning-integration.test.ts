import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
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

function fixture(content: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#space{width:500px;height:1200px}#target{display:block;width:40px;height:20px;margin:0;padding:0;border:0}</style>${content}<div id="space"></div>`,
		"https://fixture.invalid/positioning-integration",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(120, 100);
	const target = new DocumentQueries(tree).querySelector("#target");
	if (target === null) throw new Error("Missing target");
	const actions = documentInteractions(tree);
	const scroll = documentScroll(tree);
	const owner = documentScrollIntoView(tree);
	return { tree, target, actions, scroll, owner };
}

const fixedMarkup = [
	'<button id="target" style="position:fixed;left:30px;top:20px">Go</button>',
	'<section style="position:fixed;left:30px;top:20px"><button id="target">Go</button></section>',
	'<section style="position:fixed;left:-200px;top:-150px"><button id="target">Go</button></section>',
];

it.each(["start", "center", "end", "nearest"] as const)(
	"does not scroll the root for fixed targets or descendants with %s alignment",
	(alignment) => {
		for (const markup of fixedMarkup) {
			const { tree, target, actions, scroll, owner } = fixture(markup);
			scroll.to(80, 300);
			const before = documentGeometry(tree).getBoundingClientRect(target);
			const notified = vi.fn();
			actions.events.addEventListener(tree.root, "scroll", notified);
			expect(
				runEventAction(
					actions.events,
					owner.action(target, {
						block: alignment,
						inline: alignment,
					}),
				),
			).toMatchObject({
				hasBox: true,
				changed: false,
				scroll: { x: 80, y: 300 },
			});
			expect(documentGeometry(tree).getBoundingClientRect(target)).toEqual(
				before,
			);
			expect(notified).not.toHaveBeenCalled();
		}
	},
);

it.each(fixedMarkup.slice(0, 2))(
	"does not move the document when default element focus targets fixed markup %s",
	(markup) => {
		const { target, actions, scroll } = fixture(markup);
		scroll.to(80, 300);
		actions.focus.focusElement(target);
		expect(actions.focus.active()).toBe(target);
		expect(scroll.get()).toEqual({ x: 80, y: 300 });
	},
);

it("does not treat a boxless display-contents ancestor as a fixed containing box", () => {
	const { tree, target, actions, owner, scroll } = fixture(
		'<div style="height:180px"></div><section style="display:contents;position:fixed"><button id="target">Go</button></section>',
	);
	expect(runEventAction(actions.events, owner.action(target)).changed).toBe(
		true,
	);
	expect(scroll.get().y).toBe(180);
	expect(documentGeometry(tree).getBoundingClientRect(target).top).toBe(0);
});

it("rechecks fixed versus absolute positioning after a style mutation", () => {
	const { tree, target, actions, owner, scroll } = fixture(fixedMarkup[0]);
	scroll.to(80, 300);
	runEventAction(actions.events, owner.action(target));
	expect(scroll.get()).toEqual({ x: 80, y: 300 });
	tree.setAttribute(target, "style", "position:absolute;left:30px;top:20px");
	expect(runEventAction(actions.events, owner.action(target)).changed).toBe(
		true,
	);
	expect(scroll.get().y).toBe(20);
});

it("keeps pre-wrap editing and shared selection inside a fixed editor across root scrolling", () => {
	const { tree, target, actions, scroll } = fixture(
		'<div id="target" contenteditable style="position:fixed;left:10px;top:10px;width:90px;height:70px;white-space:pre-wrap;font-size:8px"></div>',
	);
	actions.fill(tree.reference(target), "Alpha  beta\n  line");
	actions.keyboard.type("!");
	const selection = domRangeOwner(tree).selection;
	const before = documentGeometry(tree).getBoundingClientRect(target);
	const textNode = tree.get(target).children[0];
	expect(selection.focusNode).toBe(textNode);
	scroll.to(80, 300);
	actions.keyboard.press("Backspace");
	expect(tree.textContent(target)).toBe("Alpha  beta\n  line");
	expect(selection.focusNode).toBe(textNode);
	expect(documentGeometry(tree).getBoundingClientRect(target)).toEqual(before);
	expect(scroll.get()).toEqual({ x: 80, y: 300 });
});

it("splits and types into a fixed rich editor without moving its viewport anchor", () => {
	const { tree, target, actions, scroll } = fixture(
		'<div id="target" contenteditable style="position:fixed;left:10px;top:10px;width:90px;height:70px;white-space:pre-wrap;font-size:8px"></div>',
	);
	actions.fill(tree.reference(target), "First");
	const original = tree.get(target).children[0];
	scroll.to(80, 300);
	const before = documentGeometry(tree).getBoundingClientRect(target);
	expect(actions.keyboard.press("Enter").canceled).toBe(false);
	actions.keyboard.type("Second");
	const paragraphs = tree.get(target).children;
	expect(paragraphs).toHaveLength(2);
	expect(paragraphs.map((id) => tree.get(id).tagName)).toEqual(["div", "div"]);
	expect(paragraphs.map((id) => tree.textContent(id))).toEqual([
		"First",
		"Second",
	]);
	expect(tree.get(paragraphs[0]).children).toEqual([original]);
	expect(domRangeOwner(tree).selection.focusNode).toBe(
		tree.get(paragraphs[1]).children[0],
	);
	expect(documentGeometry(tree).getBoundingClientRect(target)).toEqual(before);
	expect(scroll.get()).toEqual({ x: 80, y: 300 });
});
