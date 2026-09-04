import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	DocumentGeneratedControls,
	documentGeneratedControls,
} from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture() {
	const tree = parseHtmlDocument(
		"<details></details><div></div>",
		"https://fixture.invalid/generated-controls",
	);
	documents.push(tree);
	const details = [...tree.walk()].find(
		({ node }) => node.tagName === "details",
	)?.node.id;
	if (details === undefined) throw new Error("Missing details");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(details);
	if (!target) throw new Error("Missing generated target");
	return { tree, details, controls, target };
}

it("keeps generated references separate from DOM references and owners", () => {
	const { tree, details, controls, target } = fixture();
	expect(Object.isFrozen(target)).toBe(true);
	expect(documentGeneratedControls(tree)).toBe(controls);
	expect(controls.resolve(target.ref)).toBe(target);
	expect(target.owner).toBe(details);
	expect(target.ref).not.toBe(tree.reference(details));
	expect(() => tree.resolve(target.ref)).toThrow(/Invalid element reference/i);
	expect(() => controls.resolve(tree.reference(details))).toThrow(
		/Invalid generated control reference/i,
	);
});

it("does not accept a foreign document's generated reference", () => {
	const first = fixture();
	const second = fixture();
	expect(first.target.ref).not.toBe(second.target.ref);
	expect(() => first.controls.resolve(second.target.ref)).toThrow(
		/no longer available/i,
	);
});

it("retains host-owned identity across state and body changes", () => {
	const { tree, details, controls, target } = fixture();
	tree.setAttribute(details, "open", "");
	tree.append(details, tree.createElement("span"));
	tree.setAttribute(details, "class", "styled");
	expect(controls.detailsSummary(details)).toBe(target);
	expect(controls.metrics().targets).toBe(1);
});

it("makes targets unavailable while an authored summary is present without inventing a new control on removal", () => {
	const { tree, details, controls, target } = fixture();
	const summary = tree.createElement("summary");
	tree.append(details, summary);
	expect(controls.detailsSummary(details)).toBeUndefined();
	expect(() => controls.resolve(target.ref)).toThrow(/no longer available/i);
	tree.remove(summary);
	expect(controls.resolve(target.ref)).toBe(target);
});

it("rejects detached targets and restores the same target when the same host reconnects", () => {
	const { tree, details, controls, target } = fixture();
	const parent = tree.get(details).parent;
	if (parent === null) throw new Error("Missing parent");
	tree.remove(details);
	expect(controls.detailsSummary(details)).toBeUndefined();
	expect(() => controls.resolve(target.ref)).toThrow(/no longer available/i);
	tree.append(parent, details);
	expect(controls.resolve(target.ref)).toBe(target);
});

it("does not manufacture targets for other node kinds or detached hosts", () => {
	const { tree, controls } = fixture();
	for (const id of [
		tree.root,
		tree.createText("Details"),
		tree.createFragment(),
		tree.createElement("div"),
		tree.createElement("details"),
	])
		expect(controls.detailsSummary(id)).toBeUndefined();
	expect(controls.metrics().targets).toBe(1);
});

it.each([
	"",
	"u0-details-1",
	"u1-details-0",
	"u1-details-01",
	"u1-details-1-tail",
	"u1-details-1\n",
	"u".repeat(81),
])("rejects malformed reference %s", (reference) => {
	const { controls } = fixture();
	expect(() => controls.resolve(reference)).toThrow(
		/Invalid generated control reference/i,
	);
});

it.each([0, -1, 1.5, Number.NaN, 4097])(
	"rejects invalid target limit %s",
	(limit) => {
		const { tree } = fixture();
		expect(() => new DocumentGeneratedControls(tree, limit)).toThrow(
			/Invalid generated control limit/i,
		);
	},
);

it("preflights target limits without changing the document or losing previous targets", () => {
	const { tree, details } = fixture();
	const controls = new DocumentGeneratedControls(tree, 1);
	const target = controls.detailsSummary(details);
	const other = tree.createElement("details");
	const parent = tree.get(details).parent;
	if (parent === null || !target) throw new Error("Missing fixture owner");
	tree.append(parent, other);
	const revision = tree.revision;
	expect(() => controls.detailsSummary(other)).toThrow(/target limit/i);
	expect(controls.metrics().targets).toBe(1);
	expect(controls.resolve(target.ref)).toBe(target);
	expect(tree.revision).toBe(revision);
	controls.close();
});

it("closes registry state with the document and revokes retained access", () => {
	const { tree, details, controls, target } = fixture();
	tree.close();
	expect(controls.metrics()).toMatchObject({ targets: 0, closed: true });
	expect(() => controls.resolve(target.ref)).toThrow(/closed/i);
	expect(() => controls.detailsSummary(details)).toThrow(/closed/i);
	controls.close();
});
