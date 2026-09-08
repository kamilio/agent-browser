import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import * as headingSections from "./extraction-section.js";
import { selectHeadingSection } from "./extraction-section.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	researchReaderProfile,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://example.com/sections";
const plannerOptions = {
	maxNodes: 100,
	maxDepth: 20,
	skip: () => false,
	visible: () => true,
	descend: () => true,
};

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree(url);
	trees.push(tree);
	return tree;
}

function html(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	text?: string,
	attributes: Record<string, string> = {},
) {
	const id = tree.createElement(tagName, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
	return id;
}

function reference(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return tree.reference(id);
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	const nodes: ExtractedNode[] = [];
	const pending = [node];
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		nodes.push(current);
		pending.push(...(current.children ?? []));
	}
	return nodes;
}

it.each(["h1", "h2"])(
	"stops before the next %s and counts prefix, boundary and context precisely",
	(boundaryTag) => {
		const tree = document();
		append(tree, tree.root, "p", "Before");
		const heading = append(tree, tree.root, "h2", "Start");
		append(tree, tree.root, "p", "Body");
		append(tree, tree.root, "h3", "Lower");
		append(tree, tree.root, "p", "Detail");
		const boundary = append(tree, tree.root, boundaryTag, "Stop");
		append(tree, tree.root, "p", "After");
		const section = tree.reference(heading);
		const result = extractDocument(tree, { section, maxNodes: 12 });
		expect(result.content).toBe("## Start\n\nBody\n\n### Lower\n\nDetail\n");
		expect(result.sectionSelection).toEqual({
			method: "heading-section",
			heading: section,
			level: 2,
			end: tree.reference(boundary),
			scannedNodes: 12,
			selectedNodes: 8,
			contextNodes: 1,
		});
		expect(Object.isFrozen(result.sectionSelection)).toBe(true);
		expect(result.scope).toBe(tree.reference(tree.root));
		expect(result.document).toBe(result.scope);
		expect(result.partial).toBe(true);
		expect(() => extractDocument(tree, { section, maxNodes: 11 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const plan = selectHeadingSection(tree, section, plannerOptions);
		expect(plan.context).toEqual(new Set([tree.root]));
		expect(plan.included.size).toBe(9);
		expect(plan.included.has(boundary)).toBe(false);
	},
);

it.each([1, 2, 3, 4, 5, 6])("selects h%s through document end", (level) => {
	const tree = document();
	const heading = append(tree, tree.root, `h${level}`, "Final");
	append(tree, tree.root, "p", "Last paragraph");
	const result = extractDocument(tree, { section: tree.reference(heading) });
	expect(result.content).toBe(`${"#".repeat(level)} Final\n\nLast paragraph\n`);
	expect(result.sectionSelection).toMatchObject({
		level,
		end: null,
		scannedNodes: 5,
		selectedNodes: 4,
		contextNodes: 1,
	});
	expect(extractDocument(tree)).not.toHaveProperty("sectionSelection");
});

it.each(
	[0, 32, 4096].flatMap((tail) =>
		(["markdown", "json"] as const).map((format) => ({ tail, format })),
	),
)(
	"bounds materialization operations with $tail excluded siblings ($format)",
	({ tail, format }) => {
		const tree = document();
		const heading = append(tree, tree.root, "h2", "Start");
		const boundary = append(tree, tree.root, "h2");
		for (let index = 0; index < tail; index++) append(tree, tree.root, "p");
		const original = selectHeadingSection;
		const plans: ReturnType<typeof selectHeadingSection>[] = [];
		vi.spyOn(headingSections, "selectHeadingSection").mockImplementation(
			(...args) => {
				const plan = original(...args);
				vi.spyOn(plan.included, "has");
				vi.spyOn(plan.children, "get");
				plans.push(plan);
				return plan;
			},
		);
		const result = extractDocument(tree, {
			section: tree.reference(heading),
			format,
			maxNodes: 4,
			maxDepth: 2,
		});
		expect(plans).toHaveLength(1);
		const [plan] = plans;
		expect(plan.included.has).toHaveBeenCalledTimes(3);
		expect(plan.children.get).toHaveBeenCalledTimes(2);
		expect([...plan.children]).toEqual([
			[tree.root, [heading]],
			[heading, [...tree.get(heading).children]],
		]);
		expect(plan.included.size).toBe(3);
		expect(result.sectionSelection).toMatchObject({
			end: tree.reference(boundary),
			scannedNodes: 4,
			selectedNodes: 2,
			contextNodes: 1,
		});
		if (result.format === "markdown") expect(result.content).toBe("## Start\n");
		else {
			expect(flattened(result.content).map((node) => node.ref)).toEqual(
				[tree.root, heading, ...tree.get(heading).children].map((id) =>
					tree.reference(id),
				),
			);
			expect(result.content.children?.[0]).toMatchObject({
				type: "heading",
				level: 2,
				children: [{ type: "text", text: "Start" }],
			});
		}
	},
);

it.each([
	{ tagName: "img", type: "image" },
	{ tagName: "br", type: "break" },
	{ tagName: "hr", type: "separator" },
])(
	"includes visible $tagName leaves without scanning their descendants",
	({ tagName, type }) => {
		const tree = document();
		const heading = append(tree, tree.root, "h2", "Start");
		const leaf = append(tree, tree.root, tagName, undefined, {
			alt: "Alternative",
		});
		const wrapper = append(tree, leaf, "div");
		const excludedHeading = append(tree, wrapper, "h1", "Excluded boundary");
		append(tree, wrapper, "p", "Excluded content");
		append(tree, tree.root, "p", "Following");
		const boundary = append(tree, tree.root, "h2", "Stop");
		const section = tree.reference(heading);
		for (const format of ["markdown", "json"] as const) {
			const result = extractDocument(tree, {
				section,
				format,
				maxNodes: 7,
				maxDepth: 2,
			});
			expect(result.sectionSelection).toMatchObject({
				end: tree.reference(boundary),
				scannedNodes: 7,
				selectedNodes: 5,
				contextNodes: 1,
			});
			expect(JSON.stringify(result.content)).toContain("Following");
			expect(JSON.stringify(result.content)).not.toContain("Excluded");
			if (result.format === "json") {
				const nodes = flattened(result.content);
				const record = nodes.find((node) => node.ref === tree.reference(leaf));
				expect(record).toMatchObject({ type });
				expect(record).not.toHaveProperty("children");
				expect(
					nodes.some((node) => node.ref === tree.reference(excludedHeading)),
				).toBe(false);
				if (tagName === "img") expect(record?.text).toBe("Alternative");
			}
		}
		const plan = selectHeadingSection(tree, section, {
			...plannerOptions,
			maxNodes: 7,
			maxDepth: 2,
			descend: (node) => node.id !== leaf,
		});
		expect(plan.included.has(leaf)).toBe(true);
		expect(plan.included.has(wrapper)).toBe(false);
		expect(plan.included.has(excludedHeading)).toBe(false);
		expect(plan.metadata.end).toBe(tree.reference(boundary));
	},
);

it.each(["img", "br", "hr"])(
	"rejects targets beneath visible %s leaves",
	(tagName) => {
		const tree = document();
		const leaf = append(tree, tree.root, tagName);
		const wrapper = append(tree, leaf, "div");
		const heading = append(tree, wrapper, "h2", "Unreachable");
		const section = tree.reference(heading);
		for (const format of ["markdown", "json"] as const)
			expect(() => extractDocument(tree, { section, format })).toThrow(
				expect.objectContaining({ code: "not-actionable" }),
			);
		expect(() =>
			selectHeadingSection(tree, section, {
				...plannerOptions,
				descend: (node) => node.id !== leaf,
			}),
		).toThrow(expect.objectContaining({ code: "not-actionable" }));
	},
);

it.each(["img", "br", "hr"])(
	"prunes %s leaf prefixes before the target",
	(tagName) => {
		const tree = document();
		const leaf = append(tree, tree.root, tagName);
		const wrapper = append(tree, leaf, "div");
		append(tree, wrapper, "h1", "Excluded prefix");
		const heading = append(tree, tree.root, "h2", "Start");
		const result = extractDocument(tree, {
			section: tree.reference(heading),
			maxNodes: 4,
			maxDepth: 2,
		});
		expect(result.content).toBe("## Start\n");
		expect(result.sectionSelection).toMatchObject({
			end: null,
			scannedNodes: 4,
			selectedNodes: 2,
			contextNodes: 1,
		});
	},
);

it.each(["img", "br", "hr"])(
	"admits restored descendants of invisible %s containers",
	(tagName) => {
		const tree = document();
		const heading = append(tree, tree.root, "h2", "Start");
		const container = append(tree, tree.root, tagName, undefined, {
			style: "visibility:hidden",
		});
		const restored = append(tree, container, "h1", "Restored", {
			style: "visibility:visible",
		});
		const boundary = append(tree, tree.root, "h1", "Stop");
		const before = extractDocument(tree, { section: tree.reference(heading) });
		expect(before.content).toBe("## Start\n");
		expect(before.sectionSelection?.end).toBe(tree.reference(restored));
		const result = extractDocument(tree, { section: tree.reference(restored) });
		expect(result.content).toBe("# Restored\n");
		expect(result.sectionSelection).toMatchObject({
			end: tree.reference(boundary),
			scannedNodes: 7,
			selectedNodes: 2,
			contextNodes: 2,
		});
	},
);

it("crosses ancestor containers and stops at a nested non-sibling boundary", () => {
	const tree = html(
		'<article><p>Before</p><div><h2 id="start">Start</h2><p>First</p></div><p>Outside wrapper</p></article><aside><div><h3>Lower</h3><p>Second</p><section><h2 id="stop">Stop</h2><p>After</p></section></div></aside>',
	);
	const result = extractDocument(tree, { section: reference(tree, "#start") });
	for (const text of ["Start", "First", "Outside wrapper", "Lower", "Second"])
		expect(result.content).toContain(text);
	for (const text of ["Before", "Stop", "After"])
		expect(result.content).not.toContain(text);
	expect(result.sectionSelection?.end).toBe(reference(tree, "#stop"));
});

it.each([0, 64])(
	"preserves ordered cross-ancestor child edges with %s nested suffix siblings",
	(tail) => {
		const tree = document();
		const later = tree.createElement("aside");
		const article = append(tree, tree.root, "article");
		append(tree, article, "p", "Before");
		const wrapper = append(tree, article, "div");
		const heading = append(tree, wrapper, "h2", "Start");
		const first = append(tree, wrapper, "p", "First");
		const outside = append(tree, article, "p", "Outside");
		tree.append(tree.root, later);
		const lower = append(tree, later, "h3", "Lower");
		const detail = append(tree, later, "p", "Detail");
		const boundaryWrapper = append(tree, later, "section");
		const boundary = append(tree, boundaryWrapper, "h2", "Stop");
		for (let index = 0; index < tail; index++) {
			append(tree, boundaryWrapper, "p", "Nested suffix");
			append(tree, later, "p", "Ancestor suffix");
			append(tree, tree.root, "p", "Root suffix");
		}
		const section = tree.reference(heading);
		const plan = selectHeadingSection(tree, section, {
			...plannerOptions,
			maxNodes: 18,
			maxDepth: 4,
		});
		const expectedChildren = new Map([
			[tree.root, [article, later]],
			[article, [wrapper, outside]],
			[wrapper, [heading, first]],
			[later, [lower, detail, boundaryWrapper]],
			...[heading, first, outside, lower, detail].map(
				(id): [number, number[]] => [id, [...tree.get(id).children]],
			),
		]);
		expect(plan.children).toEqual(expectedChildren);
		expect([...plan.children.values()].flat()).toHaveLength(
			plan.included.size - 1,
		);
		expect(plan.metadata).toMatchObject({
			end: tree.reference(boundary),
			scannedNodes: 18,
			selectedNodes: 12,
			contextNodes: 3,
		});
		for (const format of ["markdown", "json"] as const) {
			const result = extractDocument(tree, {
				section,
				format,
				maxNodes: 18,
				maxDepth: 4,
			});
			expect(result.sectionSelection).toEqual(plan.metadata);
			if (result.format === "markdown")
				expect(result.content).toBe(
					"## Start\n\nFirst\n\nOutside\n\n### Lower\n\nDetail\n",
				);
			else {
				const nodes = flattened(result.content);
				expect(nodes).toHaveLength(plan.included.size);
				for (const [parent, children] of expectedChildren) {
					const record = nodes.find(
						(node) => node.ref === tree.reference(parent),
					);
					expect(record?.children?.map((node) => node.ref)).toEqual(
						children.map((id) => tree.reference(id)),
					);
				}
			}
		}
	},
);

it("includes the target subtree but stops before a boundary inside it", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	const strong = append(tree, heading, "strong", "Included");
	const boundary = append(tree, heading, "h1", "Stop");
	append(tree, heading, "span", "After");
	const result = extractDocument(tree, { section: tree.reference(heading) });
	expect(result.content).toContain("Included");
	expect(result.content).not.toContain("Stop");
	expect(result.content).not.toContain("After");
	expect(result.sectionSelection).toMatchObject({
		end: tree.reference(boundary),
		scannedNodes: 6,
		selectedNodes: 4,
		contextNodes: 1,
	});
	const plan = selectHeadingSection(
		tree,
		tree.reference(heading),
		plannerOptions,
	);
	expect(plan.children).toEqual(
		new Map([
			[tree.root, [heading]],
			[heading, [tree.get(heading).children[0], strong]],
			[strong, [...tree.get(strong).children]],
		]),
	);
});

it("emits ancestors as neutral containers without prior text, URLs or attributes", () => {
	const tree = document();
	const ancestor = append(tree, tree.root, "h1", "Prior heading");
	const list = append(tree, ancestor, "ol", undefined, { start: "42" });
	const item = append(tree, list, "li", "Prior item");
	const link = append(tree, item, "a", "Prior link", {
		href: "https://private.example/ancestor",
	});
	const heading = append(tree, link, "h2", "Selected");
	append(tree, link, "p", "Body");
	const boundary = append(tree, tree.root, "h2", "Stop");
	const section = tree.reference(heading);
	const result = extractDocument(tree, { section, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	const nodes = flattened(result.content);
	for (const id of [tree.root, ancestor, list, item, link])
		expect(nodes.find((node) => node.ref === tree.reference(id))).toEqual({
			ref: tree.reference(id),
			type: "container",
			children: expect.any(Array),
		});
	for (const excluded of ["Prior", "private.example", '"start"', '"ordered"'])
		expect(JSON.stringify(result.content)).not.toContain(excluded);
	expect(result.sectionSelection).toMatchObject({
		end: tree.reference(boundary),
		scannedNodes: 13,
		selectedNodes: 4,
		contextNodes: 5,
	});
	expect(extractDocument(tree, { section }).content).toBe(
		"## Selected\n\nBody\n",
	);
});

it("prunes hidden, inert, omitted and undisplayed boundaries", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	const omittedAttributes: Record<string, string>[] = [
		{ hidden: "" },
		{ inert: "" },
		{ "aria-hidden": "TRUE" },
		{ style: "display:none" },
	];
	for (const attributes of omittedAttributes) {
		const wrapper = append(tree, tree.root, "div", undefined, attributes);
		append(tree, wrapper, "h1", "Secret");
	}
	for (const tagName of [
		"head",
		"script",
		"style",
		"template",
		"iframe",
		"select",
		"textarea",
		"canvas",
	]) {
		const wrapper = append(tree, tree.root, tagName);
		append(tree, wrapper, "h1", "Secret");
	}
	append(tree, tree.root, "p", "Admitted");
	const boundary = append(tree, tree.root, "h2", "Stop");
	const result = extractDocument(tree, { section: tree.reference(heading) });
	expect(result.content).toBe("## Start\n\nAdmitted\n");
	expect(result.sectionSelection).toMatchObject({
		end: tree.reference(boundary),
		scannedNodes: 18,
		selectedNodes: 4,
		contextNodes: 1,
	});
});

it("ignores invisible headings while scanning their visibility-restored descendants", () => {
	const tree = html(
		'<h2 id="start">Start</h2><h1 style="visibility:hidden">Invisible<span style="visibility:visible">Restored text</span></h1><p>Following</p><div style="visibility:hidden"><h1 style="visibility:visible" id="stop">Stop</h1></div><p>After</p>',
	);
	const result = extractDocument(tree, { section: reference(tree, "#start") });
	expect(result.content).toContain("Restored text");
	expect(result.content).toContain("Following");
	for (const excluded of ["Invisible", "Stop", "After"])
		expect(result.content).not.toContain(excluded);
	expect(result.sectionSelection?.end).toBe(reference(tree, "#stop"));
});

it("allows a visible target within an invisible but non-skipped ancestor", () => {
	const tree = html(
		'<div style="visibility:hidden">Prior<h2 id="start" style="visibility:visible">Start</h2><p style="visibility:visible">Body</p></div><h1 id="stop">Stop</h1>',
	);
	const result = extractDocument(tree, { section: reference(tree, "#start") });
	expect(result.content).toBe("## Start\n\nBody\n");
	expect(result.sectionSelection?.end).toBe(reference(tree, "#stop"));
});

it.each(["hidden", "inert", 'aria-hidden="true"', 'style="display:none"'])(
	"rejects a target below a skipped %s ancestor",
	(attribute) => {
		const tree = html(`<div ${attribute}><h2 id="start">Start</h2></div>`);
		expect(() =>
			extractDocument(tree, { section: reference(tree, "#start") }),
		).toThrow(expect.objectContaining({ code: "not-actionable" }));
	},
);

it.each(["hidden", "inert", 'style="visibility:hidden"'])(
	"rejects an inadmissible target with %s",
	(attribute) => {
		const tree = html(`<h2 id="start" ${attribute}>Start</h2>`);
		expect(() =>
			extractDocument(tree, { section: reference(tree, "#start") }),
		).toThrow(expect.objectContaining({ code: "not-actionable" }));
	},
);

it("rejects headings inside omitted native subtrees", () => {
	const tree = document();
	const omitted = append(tree, tree.root, "canvas");
	const heading = append(tree, omitted, "h2", "Start");
	expect(() =>
		extractDocument(tree, { section: tree.reference(heading) }),
	).toThrow(expect.objectContaining({ code: "not-actionable" }));
});

it("preserves closed and stale errors and distinguishes detached and non-heading nodes", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	const paragraph = append(tree, tree.root, "p", "Not a heading");
	for (const id of [tree.root, paragraph, tree.get(heading).children[0]])
		expect(() =>
			extractDocument(tree, { section: tree.reference(id) }),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	const section = tree.reference(heading);
	tree.remove(heading);
	expect(() => extractDocument(tree, { section })).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => extractDocument(tree, { section: "e999999999" })).toThrow(
		expect.objectContaining({ code: "stale-reference" }),
	);
	tree.close();
	expect(() => extractDocument(tree, { section })).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("rejects non-string references without coercing them", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	let coercions = 0;
	const coercible = {
		toString() {
			coercions++;
			return tree.reference(heading);
		},
	};
	for (const value of [null, 1, true, [], {}, coercible, Symbol("heading")]) {
		const section = value as unknown as string;
		expect(() => selectHeadingSection(tree, section, plannerOptions)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() => extractDocument(tree, { section })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	}
	expect(() =>
		selectHeadingSection(tree, undefined as unknown as string, plannerOptions),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(coercions).toBe(0);
});

it.each(["", "h2", "e0", "e-1", "e01", " e1"])(
	"rejects malformed references: %s",
	(section) => {
		const tree = document();
		expect(() => extractDocument(tree, { section })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it("rejects section conflicts while retaining the root/lines conflict error", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	const section = tree.reference(heading);
	const root = tree.reference(tree.root);
	const lines = { start: 1, end: 1 };
	for (const options of [
		{ section, root },
		{ section, lines },
		{ section, root, lines },
	])
		expect(() => extractDocument(tree, options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(() => extractDocument(tree, { root, lines })).toThrow(
		"Text line extraction cannot be combined with root",
	);
});

it("charges skipped prefix nodes but never visits their descendants", () => {
	const tree = document();
	const hidden = append(tree, tree.root, "div", undefined, { hidden: "" });
	for (let index = 0; index < 20; index++) append(tree, hidden, "h1", "Hidden");
	const heading = append(tree, tree.root, "h2", "Start");
	const boundary = append(tree, tree.root, "h2", "Stop");
	const section = tree.reference(heading);
	expect(
		extractDocument(tree, { section, maxNodes: 5, maxDepth: 2 })
			.sectionSelection,
	).toMatchObject({
		end: tree.reference(boundary),
		scannedNodes: 5,
		selectedNodes: 2,
		contextNodes: 1,
	});
	for (const maxNodes of [1, 2, 4])
		expect(() => extractDocument(tree, { section, maxNodes })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("enforces document-relative ancestor, prefix, selection and boundary depths", () => {
	const tree = document();
	const wrapper = append(tree, tree.root, "div");
	const nested = append(tree, wrapper, "div");
	append(tree, nested, "div", undefined, { hidden: "" });
	const heading = append(tree, tree.root, "h2", "Start");
	const section = tree.reference(heading);
	expect(() => extractDocument(tree, { section, maxDepth: 2 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(extractDocument(tree, { section, maxDepth: 3 }).content).toBe(
		"## Start\n",
	);
	const deepHeading = append(tree, nested, "h2", "Deep");
	for (const maxDepth of [0, 1, 2, 3])
		expect(() =>
			extractDocument(tree, {
				section: tree.reference(deepHeading),
				maxDepth,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(
		extractDocument(tree, {
			section: tree.reference(deepHeading),
			maxDepth: 4,
		}).content,
	).toBe("## Deep\n");
	const boundaryTree = document();
	const start = append(boundaryTree, boundaryTree.root, "h2", "Start");
	const container = append(boundaryTree, boundaryTree.root, "div");
	const boundaryWrapper = append(boundaryTree, container, "div");
	append(boundaryTree, boundaryWrapper, "h1", "Stop");
	expect(() =>
		extractDocument(boundaryTree, {
			section: boundaryTree.reference(start),
			maxDepth: 2,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(
		extractDocument(boundaryTree, {
			section: boundaryTree.reference(start),
			maxDepth: 3,
		}).content,
	).toBe("## Start\n");
});

it("fails not-found when callbacks no longer admit the target during scanning", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	let rootVisits = 0;
	expect(() =>
		selectHeadingSection(tree, tree.reference(heading), {
			...plannerOptions,
			skip: (node) => node.id === tree.root && ++rootVisits > 1,
		}),
	).toThrow(expect.objectContaining({ code: "not-found" }));
});

it("keeps exact UTF-8 output budgets and independent scan and structure budgets", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	append(tree, tree.root, "p", "界".repeat(200));
	append(tree, tree.root, "h2", "Stop");
	const section = tree.reference(heading);
	for (const format of ["markdown", "json"] as const) {
		const result = extractDocument(tree, { section, format, maxNodes: 6 });
		const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
		expect(
			extractDocument(tree, {
				section,
				format,
				maxNodes: 6,
				maxBytes: bytes,
			}),
		).toEqual(result);
		expect(() =>
			extractDocument(tree, { section, format, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("retains the intermediate budget when cleaning expands control text", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	append(tree, tree.root, "p", "\x1b".repeat(700_000));
	append(tree, tree.root, "h2", "Stop");
	expect(() =>
		extractDocument(tree, {
			section: tree.reference(heading),
			maxBytes: 1_048_576,
		}),
	).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Extraction intermediate limit exceeded",
		}),
	);
});

it("does not mutate nodes, revisions or the change journal", () => {
	const tree = html(
		'<p>Before</p><h2 id="start">Start</h2><p><a href="/next">Next</a></p><h1>Stop</h1>',
	);
	const section = reference(tree, "#start");
	const source = serializeHtml(tree, tree.root);
	const revision = tree.revision;
	const changes = tree.changesSince(0);
	for (const format of ["markdown", "json"] as const) {
		const result = extractDocument(tree, { section, format });
		expect(extractDocument(tree, { section, format })).toEqual(result);
		expect(result.revision).toBe(revision);
	}
	expect(tree.revision).toBe(revision);
	expect(tree.changesSince(0)).toEqual(changes);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});

it("keeps reader metadata and selects a small section in a large loaded document", () => {
	const body = new TextEncoder().encode(
		`<title>Reader</title><h2>Start</h2><p>Small</p><h2>Stop</h2>${"<p>Outside</p>".repeat(5100)}<script>Omitted</script>`,
	);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 1,
		},
		{
			tabId: "synthetic-sections",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 256,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
	);
	trees.push(tree);
	const section = reference(tree, "h2");
	expect(() => extractDocument(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	for (const format of ["markdown", "json"] as const) {
		const result = extractDocument(tree, { section, format, maxNodes: 20 });
		expect(result.reader).toEqual(researchReaderInfo(tree));
		expect(result.reader?.profile).toBe(researchReaderProfile);
		expect(result.title).toBe("Reader");
		expect(result.sectionSelection?.scannedNodes).toBeLessThan(20);
		expect(JSON.stringify(result.content)).toContain("Small");
		expect(JSON.stringify(result.content)).not.toContain("Outside");
	}
});

it.each([
	{ maxNodes: 0 },
	{ maxDepth: -1 },
	{ maxDepth: 1025 },
	{ maxBytes: 255 },
	{ maxNodes: Number.NaN },
])(
	"retains validated public extraction limits: %j",
	(limits: ExtractionOptions) => {
		const tree = document();
		const heading = append(tree, tree.root, "h2", "Start");
		expect(() =>
			extractDocument(tree, { section: tree.reference(heading), ...limits }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

const sectionTableMarkers = {
	tableBegin:
		"**Native table begin (selected structure only; associations unspecified)**",
	tableEnd: "**Native table end**",
	rowBegin: "**Native row begin (selected structure only)**",
	rowEnd: "**Native row end**",
	cellBegin: "**Native cell begin (selected structure only)**",
	cellEnd: "**Native cell end**",
};

function sectionTableBlocks(...blocks: string[]): string {
	return `${blocks.join("\n\n")}\n`;
}

it.each(["row", "cell"] as const)(
	"renders a scoped native %s fragment without enclosing table or sibling boundaries",
	(kind) => {
		const tree = document();
		const table = append(tree, tree.root, "table");
		const earlier = append(tree, table, "tr");
		append(tree, earlier, "th", "Outside header");
		const row = append(tree, table, "tr");
		const cell = append(tree, row, "td", "Selected");
		append(tree, row, "th");
		const later = append(tree, table, "tr");
		append(tree, later, "td", "Outside later");
		const root = tree.reference(kind === "row" ? row : cell);
		const structured = extractDocument(tree, { root, format: "json" });
		if (structured.format !== "json") throw new Error("Unexpected format");
		expect(structured.content.ref).toBe(root);
		expect(structured.content.type).toBe(kind);
		expect(
			flattened(structured.content)
				.filter((node) => ["table", "row", "cell"].includes(node.type))
				.map((node) => node.type),
		).toEqual(kind === "row" ? ["row", "cell", "cell"] : ["cell"]);
		const result = extractDocument(tree, { root });
		expect(result.scope).toBe(root);
		expect(result.partial).toBe(true);
		expect(result).not.toHaveProperty("sectionSelection");
		expect(result.content).toBe(
			kind === "row"
				? sectionTableBlocks(
						sectionTableMarkers.rowBegin,
						sectionTableMarkers.cellBegin,
						"Selected",
						sectionTableMarkers.cellEnd,
						sectionTableMarkers.cellBegin,
						sectionTableMarkers.cellEnd,
						sectionTableMarkers.rowEnd,
					)
				: sectionTableBlocks(
						sectionTableMarkers.cellBegin,
						"Selected",
						sectionTableMarkers.cellEnd,
					),
		);
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
	},
);

it("keeps table, row and cell heading-section ancestors as context containers", () => {
	const tree = document();
	const table = append(tree, tree.root, "table");
	const row = append(tree, table, "tr");
	const cell = append(tree, row, "td");
	const excluded = append(tree, cell, "p", "Before selection");
	const heading = append(tree, cell, "h2", "Start");
	append(tree, cell, "p", "Body");
	append(tree, row, "td", "Neighbor");
	const laterRow = append(tree, table, "tr");
	append(tree, laterRow, "td", "Later");
	const boundary = append(tree, tree.root, "h2", "Stop");
	append(tree, tree.root, "p", "Excluded tail");
	const section = tree.reference(heading);
	const plan = selectHeadingSection(tree, section, plannerOptions);
	expect(plan.context).toEqual(new Set([tree.root, table, row, cell]));
	expect(plan.included.has(excluded)).toBe(false);
	expect(plan.included.has(boundary)).toBe(false);
	const structured = extractDocument(tree, { section, format: "json" });
	if (structured.format !== "json") throw new Error("Unexpected format");
	const nodes = flattened(structured.content);
	for (const contextId of [tree.root, table, row, cell]) {
		expect(
			nodes.find((node) => node.ref === tree.reference(contextId))?.type,
		).toBe("container");
	}
	expect(nodes.filter((node) => node.type === "table")).toEqual([]);
	expect(
		nodes.filter((node) => node.type === "row").map((node) => node.ref),
	).toEqual([tree.reference(laterRow)]);
	expect(nodes.some((node) => node.ref === tree.reference(excluded))).toBe(
		false,
	);
	const markdown = extractDocument(tree, { section });
	for (const result of [markdown, structured]) {
		expect(result.sectionSelection).toEqual(plan.metadata);
		expect(result.sectionSelection?.end).toBe(tree.reference(boundary));
		expect(result.scope).toBe(tree.reference(tree.root));
		expect(result.partial).toBe(true);
	}
	expect(markdown.content).toBe(
		sectionTableBlocks(
			"## Start",
			"Body",
			sectionTableMarkers.cellBegin,
			"Neighbor",
			sectionTableMarkers.cellEnd,
			sectionTableMarkers.rowBegin,
			sectionTableMarkers.cellBegin,
			"Later",
			sectionTableMarkers.cellEnd,
			sectionTableMarkers.rowEnd,
		),
	);
	expect(extractDocument(tree, { section, format: "json" })).toEqual(
		structured,
	);
});

it("closes a heading-clipped table cell without inventing excluded cells and retains budgets", () => {
	const tree = document();
	const heading = append(tree, tree.root, "h2", "Start");
	const table = append(tree, tree.root, "table");
	const firstRow = append(tree, table, "tr");
	append(tree, firstRow, "td", "Included");
	const clippedRow = append(tree, table, "tr");
	const clippedCell = append(tree, clippedRow, "td");
	append(tree, clippedCell, "p", "Cell prefix 雪");
	const boundary = append(tree, clippedCell, "h2", "Stop");
	const excludedBody = append(tree, clippedCell, "p", "Excluded cell suffix");
	const excludedCell = append(tree, clippedRow, "td", "Excluded neighbor");
	const excludedRow = append(tree, table, "tr");
	append(tree, excludedRow, "td", "Excluded row");
	append(tree, tree.root, "p", "Excluded tail");
	const section = tree.reference(heading);
	const plan = selectHeadingSection(tree, section, plannerOptions);
	expect(plan.context).toEqual(new Set([tree.root]));
	for (const excludedId of [
		boundary,
		excludedBody,
		excludedCell,
		excludedRow,
	]) {
		expect(plan.included.has(excludedId)).toBe(false);
	}
	for (const format of ["markdown", "json"] as const) {
		const result = extractDocument(tree, { section, format });
		expect(result.sectionSelection).toEqual(plan.metadata);
		expect(result.sectionSelection?.end).toBe(tree.reference(boundary));
		if (result.format === "markdown") {
			expect(result.content).toBe(
				sectionTableBlocks(
					"## Start",
					sectionTableMarkers.tableBegin,
					sectionTableMarkers.rowBegin,
					sectionTableMarkers.cellBegin,
					"Included",
					sectionTableMarkers.cellEnd,
					sectionTableMarkers.rowEnd,
					sectionTableMarkers.rowBegin,
					sectionTableMarkers.cellBegin,
					"Cell prefix 雪",
					sectionTableMarkers.cellEnd,
					sectionTableMarkers.rowEnd,
					sectionTableMarkers.tableEnd,
				),
			);
		} else {
			const nodes = flattened(result.content);
			expect(nodes.filter((node) => node.type === "cell")).toHaveLength(2);
			for (const excludedId of [
				boundary,
				excludedBody,
				excludedCell,
				excludedRow,
			]) {
				expect(
					nodes.some((node) => node.ref === tree.reference(excludedId)),
				).toBe(false);
			}
		}
		const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
		expect(bytes).toBeGreaterThan(256);
		expect(extractDocument(tree, { section, format, maxBytes: bytes })).toEqual(
			result,
		);
		expect(() =>
			extractDocument(tree, { section, format, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(
			extractDocument(tree, {
				section,
				format,
				maxNodes: plan.metadata.scannedNodes,
				maxDepth: 5,
			}),
		).toEqual(result);
		expect(() =>
			extractDocument(tree, {
				section,
				format,
				maxNodes: plan.metadata.scannedNodes - 1,
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(() =>
			extractDocument(tree, { section, format, maxDepth: 4 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("preflights only selected table structure rather than excluded malformed siblings", () => {
	const tree = document();
	const prefix = append(tree, tree.root, "p");
	const excludedTable = append(tree, prefix, "table");
	const excludedRow = append(tree, excludedTable, "tr");
	append(tree, excludedRow, "td", "Excluded malformed prefix");
	const heading = append(tree, tree.root, "h2", "Start");
	const table = append(tree, tree.root, "table");
	const row = append(tree, table, "tr");
	append(tree, row, "td", "Selected");
	const boundary = append(tree, tree.root, "h2", "Stop");
	const suffix = append(tree, tree.root, "pre");
	append(tree, suffix, "tr", "Excluded malformed suffix");
	const section = tree.reference(heading);
	expect(() => extractDocument(tree)).toThrow(
		expect.objectContaining({
			code: "unsupported",
			message: "Unsupported table extraction structure",
		}),
	);
	const plan = selectHeadingSection(tree, section, plannerOptions);
	const structured = extractDocument(tree, { section, format: "json" });
	if (structured.format !== "json") throw new Error("Unexpected format");
	const nodes = flattened(structured.content);
	for (const excludedId of [
		prefix,
		excludedTable,
		excludedRow,
		boundary,
		suffix,
	]) {
		expect(nodes.some((node) => node.ref === tree.reference(excludedId))).toBe(
			false,
		);
	}
	const markdown = extractDocument(tree, { section });
	expect(markdown.content).toBe(
		sectionTableBlocks(
			"## Start",
			sectionTableMarkers.tableBegin,
			sectionTableMarkers.rowBegin,
			sectionTableMarkers.cellBegin,
			"Selected",
			sectionTableMarkers.cellEnd,
			sectionTableMarkers.rowEnd,
			sectionTableMarkers.tableEnd,
		),
	);
	expect(markdown.sectionSelection).toEqual(plan.metadata);
	expect(structured.sectionSelection).toEqual(plan.metadata);
	expect(extractDocument(tree, { section, format: "json" })).toEqual(
		structured,
	);
});
