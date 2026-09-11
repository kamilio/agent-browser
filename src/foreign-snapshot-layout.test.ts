import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { layoutPageDocument } from "./flex-document.js";
import {
	buildFormattingTree,
	isAdvisoryFormattingIssue,
	resolveFormattingBlockWidths,
	resolveFormattingPageWidths,
} from "./formatting-tree.js";
import {
	diffSnapshots,
	snapshotDocument,
	snapshotElementRole,
	snapshotRoleCandidates,
} from "./snapshot.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/foreign-snapshot");
	documents.push(tree);
	const root = tree.createElement("main");
	tree.append(tree.root, root);
	const add = (
		tagName: string,
		attributes: Record<string, string> = {},
		text = "",
		namespaceURI = htmlNamespace,
		parent = root,
	) => {
		const id = tree.createParserElement(tagName, attributes, namespaceURI);
		tree.append(parent, id);
		if (text) tree.append(id, tree.createText(text));
		return id;
	};
	return { tree, root, add };
}

it.each([svgNamespace, mathmlNamespace])(
	"does not infer HTML snapshot roles from foreign local names in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const foreign = [
			"a",
			"input",
			"select",
			"option",
			"label",
			"details",
			"summary",
			"title",
			"template",
			"button",
			"img",
			"h1",
			"textarea",
			"table",
			"li",
			"progress",
		].map((tagName) =>
			add(
				tagName,
				{ href: "/next", contenteditable: "true" },
				"",
				namespaceURI,
			),
		);
		const snapshot = snapshotDocument(tree);
		for (const id of foreign) {
			expect(snapshotElementRole(tree, id)).toBeUndefined();
			expect(
				snapshot.entries.find((entry) => entry.ref === tree.reference(id)),
			).toBeUndefined();
		}
		expect(snapshotRoleCandidates(tree, "button")).toEqual([]);
		expect(snapshot.entries.map((entry) => entry.role)).toEqual(["main"]);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"keeps explicit ARIA separate from HTML widget attributes in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const checkbox = add(
			"input",
			{
				role: "unknown checkbox",
				type: "checkbox",
				checked: "",
				disabled: "",
				readonly: "",
				required: "",
				"aria-label": "Foreign check",
				"aria-checked": "false",
			},
			"",
			namespaceURI,
		);
		const option = add(
			"option",
			{ role: "option", selected: "", "aria-selected": "false" },
			"Foreign option",
			namespaceURI,
		);
		const heading = add("h4", { role: "heading" }, "Heading", namespaceURI);
		const snapshot = snapshotDocument(tree);
		const entry = (id: number) =>
			snapshot.entries.find((item) => item.ref === tree.reference(id));
		expect(entry(checkbox)).toEqual({
			ref: tree.reference(checkbox),
			role: "checkbox",
			name: "Foreign check",
			depth: 1,
			checked: false,
		});
		expect(entry(option)).toMatchObject({
			role: "option",
			name: "Foreign option",
			selected: false,
		});
		expect(entry(heading)).not.toHaveProperty("level");
		for (const state of ["checked", "disabled", "readonly", "required"])
			tree.setAttribute(checkbox, `aria-${state}`, "true");
		tree.setAttribute(option, "aria-selected", "true");
		tree.setAttribute(heading, "aria-level", "2");
		expect(snapshotRoleCandidates(tree, "checkbox")).toEqual([
			expect.objectContaining({
				ref: tree.reference(checkbox),
				checked: true,
				disabled: true,
				readonly: true,
				required: true,
			}),
		]);
		expect(snapshotRoleCandidates(tree, "option")[0].selected).toBe(true);
		expect(snapshotRoleCandidates(tree, "heading")[0].level).toBe(2);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML value, naming, or link fallbacks in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		for (const tagName of ["input", "select", "textarea", "img", "a"]) {
			const id = add(
				tagName,
				{
					role: "textbox",
					type: "file",
					value: "not a control value",
					alt: "not an HTML alternative",
					title: "not an HTML title",
					placeholder: "not a placeholder",
				},
				"",
				namespaceURI,
			);
			expect(
				snapshotDocument(tree, { root: tree.reference(id) }).entries,
			).toEqual([
				{ ref: tree.reference(id), role: "textbox", name: "", depth: 0 },
			]);
		}
		const button = add(
			"input",
			{ role: "button", type: "file", alt: "Wrong", value: "Wrong" },
			"Explicit button",
			namespaceURI,
		);
		expect(snapshotRoleCandidates(tree, "button")[0]).toMatchObject({
			ref: tree.reference(button),
			name: "Explicit button",
		});
		const link = add(
			"a",
			{ role: "link", href: "/not-an-html-link" },
			"Explicit link",
			namespaceURI,
		);
		expect(
			snapshotDocument(tree, { root: tree.reference(link) }).entries,
		).toEqual([
			{
				ref: tree.reference(link),
				role: "link",
				name: "Explicit link",
				depth: 0,
			},
		]);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"handles foreign template/title content and HTML labels separately in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		add("label", { for: "field" }, "Wrong label", namespaceURI);
		const input = add("input", { id: "field" });
		add("label", { for: "field" }, "HTML label");
		const template = add("template", {}, "Foreign template", namespaceURI);
		const htmlTemplate = add("template", {}, "Hidden HTML template");
		add("title", { id: "foreign-title" }, "Foreign title", namespaceURI);
		add("title", {}, "Hidden HTML title");
		const labelled = add(
			"g",
			{ role: "img", "aria-labelledby": "foreign-title" },
			"",
			namespaceURI,
		);
		const snapshot = snapshotDocument(tree);
		expect(
			snapshot.entries.find((entry) => entry.ref === tree.reference(input)),
		).toMatchObject({ role: "textbox", name: "HTML label", value: "" });
		expect(
			snapshot.entries.find((entry) => entry.ref === tree.reference(labelled)),
		).toMatchObject({ role: "img", name: "Foreign title" });
		expect(JSON.stringify(snapshot)).toContain("Foreign template");
		expect(JSON.stringify(snapshot)).not.toContain("Hidden HTML");
		expect(
			snapshotDocument(tree, { root: tree.reference(template) }).entries,
		).toEqual([
			expect.objectContaining({ role: "text", name: "Foreign template" }),
		]);
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.nodes.find((node) => node.ref === tree.reference(template)),
		).toMatchObject({ kind: "deferred", children: [] });
		expect(
			formatting.nodes.some(
				(node) => node.ref === tree.reference(htmlTemplate),
			),
		).toBe(false);
		tree.setAttribute(template, "aria-hidden", "true");
		expect(
			snapshotDocument(tree, { root: tree.reference(template) }).entries,
		).toEqual([]);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML hidden-input or select inertness rules to %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const input = add(
			"input",
			{
				role: "img",
				type: "hidden",
				hidden: "",
				inert: "",
				"aria-label": "Foreign image",
			},
			"",
			namespaceURI,
		);
		const select = add("select", {}, "", namespaceURI);
		const button = add("button", {}, "HTML button", htmlNamespace, select);
		expect(snapshotRoleCandidates(tree, "img")).toEqual([
			expect.objectContaining({
				ref: tree.reference(input),
				name: "Foreign image",
			}),
		]);
		expect(snapshotRoleCandidates(tree, "button")).toEqual([
			expect.objectContaining({
				ref: tree.reference(button),
				name: "HTML button",
			}),
		]);
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues["element-layout-not-supported"]).toBe(2);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"defers foreign layout before HTML controls, breaks, contents, or flex in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const foreign = [
			["input", "inline-block"],
			["br", "inline"],
			["div", "block"],
			["g", "contents"],
			["foreignObject", "flex"],
			["template", "inline"],
			["title", "inline"],
		].map(([tagName, display]) => {
			const id = add(
				tagName,
				{ style: `display:${display}` },
				"",
				namespaceURI,
			);
			add("button", {}, "Must not render", htmlNamespace, id);
			return id;
		});
		const outside = add("div", {}, "Outside HTML");
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues["element-layout-not-supported"]).toBe(
			foreign.length,
		);
		expect(isAdvisoryFormattingIssue("element-layout-not-supported")).toBe(
			false,
		);
		expect(formatting.metrics.deferredSubtrees).toBe(foreign.length);
		for (const id of foreign) {
			const node = formatting.nodes.find(
				(item) => item.ref === tree.reference(id),
			);
			expect(node).toMatchObject({
				kind: "deferred",
				children: [],
				deferredReason: "element-layout-not-supported",
			});
			for (const property of ["control", "marker", "intrinsic", "paint", "box"])
				expect(node).not.toHaveProperty(property);
			expect(tree.resolve(tree.reference(id)).id).toBe(id);
		}
		expect(
			formatting.nodes
				.filter((node) => node.kind === "text")
				.map((node) => node.text),
		).toEqual(["Outside HTML"]);
		expect(() => resolveFormattingPageWidths(formatting)).toThrow("issue-free");
		expect(() => layoutPageDocument(tree, 2_000_000)).toThrow("issue-free");
		const outsideNode = formatting.nodes.find(
			(node) => node.ref === tree.reference(outside),
		);
		if (!outsideNode) throw new Error("Missing outside HTML formatting node");
		const isolated = resolveFormattingBlockWidths(
			formatting,
			[
				{
					id: outsideNode.id,
					containingBlock: formatting.root,
					containingWidth: 320,
					containingHeight: 200,
					contentX: 0,
				},
			],
			undefined,
			true,
		);
		expect(isolated.widths[0]).toMatchObject({
			ref: tree.reference(outside),
			contentWidth: 320,
		});
	},
);

it("keeps outside HTML snapshots stable and preserves resource limits", () => {
	const { tree, add } = fixture();
	const outside = add("button", {}, "Outside HTML");
	const before = snapshotDocument(tree, { root: tree.reference(outside) });
	const foreign = add("svg", {}, "", svgNamespace);
	add(
		"input",
		{ role: "textbox", "aria-label": "Foreign" },
		"",
		svgNamespace,
		foreign,
	);
	const after = snapshotDocument(tree, { root: tree.reference(outside) });
	const diff = diffSnapshots(before, after);
	expect(diff).toMatchObject({ reset: false, updated: [], removed: [] });
	expect(after.entries).toEqual(before.entries);
	expect(snapshotDocument(tree, { maxEntries: 1 }).truncated).toBe(true);
	expect(() => buildFormattingTree(tree, { maxBoxes: 1 })).toThrow("box limit");
	expect(() => buildFormattingTree(tree, { maxWork: 1 })).toThrow("work limit");
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find((node) => node.ref === tree.reference(foreign)),
	).toMatchObject({ kind: "deferred", children: [] });
	const ref = tree.reference(foreign);
	tree.close();
	expect(() => tree.resolve(ref)).toThrow();
});
