import { afterEach, expect, it } from "vitest";
import {
	formControls,
	formOwner,
	isControlDisabled,
	prepareControlIndex,
	selectOptions,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	markup = '<form id="owner"><input id="target" required></form>',
) {
	const tree = parseHtmlDocument(
		markup,
		"https://fixture.invalid/control-index",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const find = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	};
	return { tree, find };
}

it("charges a cold control index and leaves the document revision unchanged", () => {
	const { tree } = fixture();
	const revision = tree.revision;
	let work = 0;
	prepareControlIndex(tree, (amount) => {
		work += amount;
	});
	expect(work).toBeGreaterThan(tree.nodeCount);
	expect(tree.revision).toBe(revision);
});

it("reuses a warm control index without charging a nonexistent rebuild", () => {
	const { tree, find } = fixture();
	const target = find("#target");
	expect(isControlDisabled(tree, target)).toBe(false);
	const charged: number[] = [];
	prepareControlIndex(tree, (amount) => charged.push(amount));
	expect(charged).toEqual([]);
});

it("does not publish a partly prepared index when its work callback throws", () => {
	const { tree, find } = fixture();
	const target = find("#target");
	const owner = find("#owner");
	const failure = new Error("budget reached");
	let firstWork = 0;
	expect(() =>
		prepareControlIndex(tree, (amount) => {
			firstWork += amount;
			if (firstWork > 8) throw failure;
		}),
	).toThrow(failure);
	let recoveryWork = 0;
	prepareControlIndex(tree, (amount) => {
		recoveryWork += amount;
	});
	expect(recoveryWork).toBeGreaterThan(firstWork);
	expect(formOwner(tree, target)).toBe(owner);
});

it("charges attribute contents before constructing the control indexes", () => {
	const identifier = "x".repeat(2048);
	const { tree } = fixture(`<input id="${identifier}">`);
	const charged: number[] = [];
	prepareControlIndex(tree, (amount) => charged.push(amount));
	expect(charged).toContain(identifier.length);
});

it("rebuilds after disabled state changes without retaining stale candidacy", () => {
	const { tree, find } = fixture();
	const target = find("#target");
	prepareControlIndex(tree, () => {});
	tree.setAttribute(target, "disabled", "");
	let work = 0;
	prepareControlIndex(tree, (amount) => {
		work += amount;
	});
	expect(work).toBeGreaterThan(0);
	expect(isControlDisabled(tree, target)).toBe(true);
});

it("preserves fieldset legend, external form and select ownership semantics", () => {
	const { tree, find } = fixture(`<form id="owner"></form>
		<fieldset disabled><legend><input id="legend" form="owner"></legend>
		<input id="blocked" form="owner"></fieldset>
		<select id="select" form="owner"><optgroup><option id="option">Choice</option></optgroup></select>`);
	prepareControlIndex(tree, () => {});
	expect(isControlDisabled(tree, find("#legend"))).toBe(false);
	expect(isControlDisabled(tree, find("#blocked"))).toBe(true);
	expect(formControls(tree, find("#owner")).map((node) => node.id)).toEqual([
		find("#legend"),
		find("#blocked"),
		find("#select"),
	]);
	expect(selectOptions(tree, find("#select")).map((node) => node.id)).toEqual([
		find("#option"),
	]);
});

it("rejects preparing a closed document", () => {
	const { tree } = fixture();
	tree.close();
	expect(() => prepareControlIndex(tree, () => {})).toThrow(/closed/);
});
