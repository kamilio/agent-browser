import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { type DomInspectionOptions, inspectDom } from "./dom-inspection.js";

const documents: DocumentTree[] = [];
function fixture() {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const section = tree.createElement("section", {
		id: "content",
		hidden: "",
		"data-state": "initial",
	});
	const paragraph = tree.createElement("p");
	const text = tree.createText("Hello <script>\nworld");
	const comment = tree.createComment("fixture comment");
	tree.append(tree.root, section);
	tree.append(section, paragraph);
	tree.append(paragraph, text);
	tree.append(section, comment);
	return { tree, section, paragraph, text, comment };
}

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("returns preorder native structure including hidden, text and comment nodes", () => {
	const { tree, section, paragraph, text, comment } = fixture();
	const result = inspectDom(tree);
	expect(result.nodes.map((node) => node.ref)).toEqual(
		[tree.root, section, paragraph, text, comment].map((id) =>
			tree.reference(id),
		),
	);
	expect(result.nodes.map((node) => node.depth)).toEqual([0, 1, 2, 3, 2]);
	expect(result.nodes[1]).toMatchObject({
		parent: tree.reference(tree.root),
		childCount: 2,
		returnedChildren: 2,
		childrenTruncated: false,
	});
	expect(result.nodes[1].attributes).toContainEqual({
		name: "hidden",
		value: "",
		truncated: false,
	});
	expect(result.nodes[3].text).toBe("Hello <script>\nworld");
	expect(result.nodes[4].kind).toBe("comment");
	expect(result.truncated).toBe(false);
});

it("scopes to stable references and resets relative depths without changing native parents", () => {
	const { tree, section, paragraph } = fixture();
	const result = inspectDom(tree, { root: tree.reference(paragraph) });
	expect(result.root).toBe(tree.reference(paragraph));
	expect(result.nodes[0]).toMatchObject({
		depth: 0,
		parent: tree.reference(section),
	});
	expect(result.nodes).toHaveLength(2);
});

it("reports depth and node truncation without pretending missing children are absent", () => {
	const { tree } = fixture();
	const shallow = inspectDom(tree, { maxDepth: 0 });
	expect(shallow.nodes).toHaveLength(1);
	expect(shallow.nodes[0]).toMatchObject({
		childCount: 1,
		returnedChildren: 0,
		childrenTruncated: true,
	});
	expect(shallow.truncated).toBe(true);
	const limited = inspectDom(tree, { maxNodes: 2 });
	expect(limited.nodes).toHaveLength(2);
	expect(limited.nodes[1].childrenTruncated).toBe(true);
});

it("reflects mutations with stable refs while remaining an observational read", () => {
	const { tree, section, text } = fixture();
	const before = inspectDom(tree);
	tree.setAttribute(section, "data-state", "updated");
	tree.setData(text, "changed");
	const revision = tree.revision;
	const count = tree.nodeCount;
	const after = inspectDom(tree);
	expect(after.nodes[1].ref).toBe(before.nodes[1].ref);
	expect(after.nodes[1].attributes).toContainEqual({
		name: "data-state",
		value: "updated",
		truncated: false,
	});
	expect(after.nodes[3].text).toBe("changed");
	expect(after.revision).toBe(revision);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
});

it("does not copy the next native node after exhausting the node budget", () => {
	const { tree } = fixture();
	const get = vi.spyOn(tree, "get");
	const result = inspectDom(tree, { maxNodes: 1 });
	expect(result.truncated).toBe(true);
	expect(get).toHaveBeenCalledExactlyOnceWith(tree.root);
});

it.each(["password", "PASSWORD", "file"])(
	"redacts %s values from both attributes and current controls",
	(type) => {
		const { tree } = fixture();
		const field = tree.createElement("input", {
			type,
			value: "attribute-secret",
		});
		tree.setControl(field, { value: "current-secret", checked: false });
		tree.append(tree.root, field);
		const result = inspectDom(tree, { root: tree.reference(field) });
		expect(result.nodes[0]).toMatchObject({
			protected: true,
			control: { value: "[redacted]", checked: false },
		});
		expect(JSON.stringify(result)).not.toContain("attribute-secret");
		expect(JSON.stringify(result)).not.toContain("current-secret");
	},
);

it("distinguishes ordinary current form values from original attributes", () => {
	const { tree } = fixture();
	const field = tree.createElement("input", { value: "initial" });
	tree.setControl(field, {
		value: "edited",
		selected: true,
		indeterminate: false,
	});
	tree.append(tree.root, field);
	const node = inspectDom(tree, { root: tree.reference(field) }).nodes[0];
	expect(node.attributes).toContainEqual({
		name: "value",
		value: "initial",
		truncated: false,
	});
	expect(node.control).toMatchObject({
		value: "edited",
		selected: true,
		indeterminate: false,
	});
});

it("bounds content and per-node attribute output", () => {
	const { tree, section } = fixture();
	for (let index = 0; index < 100; index++)
		tree.setAttribute(section, `data-${index}`, "value".repeat(100));
	const result = inspectDom(tree, {
		root: tree.reference(section),
		maxCodeUnits: 2048,
	});
	expect(result.chargedCodeUnits).toBeLessThanOrEqual(2048);
	expect(result.nodes[0].attributes.length).toBeLessThan(64);
	expect(result.nodes[0].attributesTruncated).toBe(true);
	expect(result.truncated).toBe(true);
	const larger = inspectDom(tree, {
		root: tree.reference(section),
		maxCodeUnits: 262_144,
	});
	expect(larger.nodes[0].attributes).toHaveLength(64);
});

it("clips oversized names, values and text explicitly", () => {
	const { tree } = fixture();
	const element = tree.createElement("x".repeat(300), {
		["a".repeat(300)]: "v".repeat(3000),
	});
	tree.append(tree.root, element);
	tree.append(element, tree.createText("t".repeat(5000)));
	const result = inspectDom(tree, { root: tree.reference(element) });
	expect(result.nodes[0].name).toHaveLength(256);
	expect(result.nodes[0].nameTruncated).toBe(true);
	expect(result.nodes[0].attributes[0].truncated).toBe(true);
	expect(result.nodes[1].text).toHaveLength(4096);
	expect(result.nodes[1].textTruncated).toBe(true);
});

it("rejects detached and foreign references instead of inspecting another owner", () => {
	const { tree, paragraph } = fixture();
	const other = fixture();
	expect(() =>
		inspectDom(tree, { root: other.tree.reference(other.section) }),
	).toThrow("no longer in this document");
	const reference = tree.reference(paragraph);
	tree.remove(paragraph);
	expect(() => inspectDom(tree, { root: reference })).toThrow(
		"no longer in this document",
	);
	tree.close();
	expect(() => inspectDom(tree)).toThrow("closed");
});

it.each([
	{ maxDepth: -1 },
	{ maxDepth: 65 },
	{ maxNodes: 0 },
	{ maxNodes: 2049 },
	{ maxCodeUnits: 1023 },
	{ maxCodeUnits: 262145 },
	{ maxNodes: Number.NaN },
	{ maxDepth: 1.5 },
	{ unsupported: true },
	{ root: 1 },
])("rejects unsupported or invalid options %j", (options) => {
	const { tree } = fixture();
	expect(() => inspectDom(tree, options as DomInspectionOptions)).toThrow();
});
