import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import {
	controlChecked,
	controlValue,
	formControls,
	formOwner,
} from "./controls.js";
import { prepareFormSubmission } from "./forms.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { ScriptDom } from "./script-dom.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string) {
	const tree = parseHtmlDocument(source, "https://example.com/");
	trees.push(tree);
	const byId = (id: string) => {
		const entry = [...tree.walk()].find(
			({ node }) => node.attributes.id === id,
		);
		if (!entry) throw new Error(`Missing ${id}`);
		return entry.node.id;
	};
	return { tree, byId };
}

it("associates fostered controls with the parser's non-ancestor table form", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control name=q value=ok></table>",
	);
	expect(formOwner(tree, byId("control"))).toBe(byId("form"));
});

it("includes parser-associated non-descendants in a form's controls", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control></table>",
	);
	expect(formControls(tree, byId("form")).map((node) => node.id)).toEqual([
		byId("control"),
	]);
});

it("does not group checked parser-associated radios from different forms together", () => {
	const { tree, byId } = parse(
		"<table><form id=first><input id=one type=radio name=group checked></form><form id=second><input id=two type=radio name=group checked></table>",
	);
	expect(controlChecked(tree, byId("one"))).toBe(true);
	expect(controlChecked(tree, byId("two"))).toBe(true);
});

it.each([
	"button",
	"fieldset",
	"input",
	"object",
	"output",
	"select",
	"textarea",
])("associates a supported %s after the table form leaves the stack", (tag) => {
	const { tree, byId } = parse(
		`<table><form id=form></table><${tag} id=control></${tag}>`,
	);
	expect(formOwner(tree, byId("control"))).toBe(byId("form"));
});

it.each(["other", "", "missing"])(
	"honors an explicit form attribute %s instead of the parser pointer",
	(target) => {
		const { tree, byId } = parse(
			`<form id=other></form><table><form id=form></table><input id=control form="${target}">`,
		);
		expect(formOwner(tree, byId("control"))).toBe(
			target === "other" ? byId("other") : undefined,
		);
		expect(tree.parserFormOwner(byId("control"))).toBeUndefined();
	},
);

it("uses the same owner for submission and reset", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control name=q value=initial></table>",
	);
	const reference = tree.reference(byId("form"));
	tree.setControl(byId("control"), { value: "edited" });
	expect(prepareFormSubmission(tree, reference).request.url).toBe(
		"https://example.com/?q=edited",
	);
	const forms = new DocumentForms(tree, new DocumentEvents(tree));
	expect(forms.reset(reference)).toMatchObject({ reset: true, controls: 1 });
	expect(controlValue(tree, byId("control"))).toBe("initial");
});

it("publishes the same native association through host form bindings", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control></table>",
	);
	const dom = new ScriptDom(tree, {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			Object.assign(object, definition.methods);
			if (definition.indexed)
				Object.defineProperty(object, "length", {
					get: definition.indexed.length,
				});
			return object;
		},
	});
	try {
		const form = dom.node(byId("form")) as { elements: { length: number } };
		const control = dom.node(byId("control")) as { form: unknown };
		expect(control.form).toBe(form);
		expect(form.elements.length).toBe(1);
	} finally {
		dom.close();
	}
});

it("resets the parser override when the form attribute is set and removed", () => {
	const { tree, byId } = parse(
		"<form id=other></form><table><form id=form><input id=control></table>",
	);
	const control = byId("control");
	tree.setAttribute(control, "form", "other");
	expect(formOwner(tree, control)).toBe(byId("other"));
	tree.removeAttribute(control, "form");
	expect(formOwner(tree, control)).toBeUndefined();
	expect(tree.parserFormOwner(control)).toBeUndefined();
});

it("resets the override when an attribute node supplies a form attribute", () => {
	const { tree, byId } = parse(
		"<form id=other></form><table><form id=form><input id=control></table>",
	);
	const attribute = tree.createAttribute("form", "other");
	tree.setAttributeNode(byId("control"), attribute);
	expect(formOwner(tree, byId("control"))).toBe(byId("other"));
	tree.removeAttributeNode(byId("control"), attribute);
	expect(formOwner(tree, byId("control"))).toBeUndefined();
});

it.each(["remove", "move", "self"])(
	"resets non-ancestor ownership on a control %s",
	(action) => {
		const { tree, byId } = parse(
			"<form id=other></form><table><form id=form><input id=control></table>",
		);
		const control = byId("control");
		const parent = tree.get(control).parent;
		if (parent === null) throw new Error("Missing parent");
		expect(formOwner(tree, control)).toBe(byId("form"));
		if (action === "remove") {
			tree.remove(control);
			tree.append(parent, control);
		} else if (action === "move") tree.append(byId("other"), control);
		else tree.insert(parent, control, control);
		expect(formOwner(tree, control)).toBe(
			action === "move" ? byId("other") : undefined,
		);
		expect(tree.parserFormOwner(control)).toBeUndefined();
	},
);

it("resets overrides when an ancestor moves without the form", () => {
	const { tree, byId } = parse(
		"<form id=other></form><table><form id=form></table><div id=holder><input id=control></div>",
	);
	tree.append(byId("other"), byId("holder"));
	expect(formOwner(tree, byId("control"))).toBe(byId("other"));
});

it("retains association when a removed subtree contains both form and control", () => {
	const { tree, byId } = parse(
		"<form id=other></form><div id=holder><table><form id=form></table><input id=control></div>",
	);
	const holder = byId("holder");
	const control = byId("control");
	const form = byId("form");
	tree.remove(holder);
	expect(formOwner(tree, control)).toBe(form);
	tree.append(byId("other"), holder);
	expect(formOwner(tree, control)).toBe(form);
});

it("keeps an external association when only its non-ancestor form is detached", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control></table>",
	);
	const control = byId("control");
	const form = byId("form");
	tree.remove(form);
	expect(formOwner(tree, control)).toBe(form);
	tree.remove(control);
	expect(formOwner(tree, control)).toBeUndefined();
});

it("does not copy parser overrides through native cloning or importing", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=control></table>",
	);
	const clone = tree.clone(byId("control"), true);
	expect(formOwner(tree, clone)).toBeUndefined();
	const other = new DocumentTree("https://other.example/");
	trees.push(other);
	const copy = other.copyFrom(tree, byId("control"));
	expect(formOwner(other, copy)).toBeUndefined();
});

it("resets fragment parser associations during transfer into the destination", () => {
	const { tree, fragment } = parseHtmlFragment(
		"<table><form id=form></table><input id=control>",
		"https://example.com/",
		{ tagName: "body" },
	);
	trees.push(tree);
	const entries = [...tree.walk(fragment)];
	const form = entries.find(({ node }) => node.tagName === "form")?.node.id;
	const control = entries.find(({ node }) => node.tagName === "input")?.node.id;
	if (form === undefined || control === undefined)
		throw new Error("Missing fragment nodes");
	expect(formOwner(tree, control)).toBe(form);
	const destination = tree.createElement("div");
	tree.append(tree.root, destination);
	tree.append(destination, fragment);
	expect(formOwner(tree, control)).toBeUndefined();
});

it("does not apply the outer form pointer inside template contents", () => {
	const { tree, byId } = parse(
		"<form id=form><template id=template><input id=control></template></form>",
	);
	const content = tree.templateContent(byId("template"));
	const input = [...content.tree.walk(content.id)].find(
		({ node }) => node.tagName === "input",
	);
	if (!input) throw new Error("Missing template input");
	expect(formOwner(content.tree, input.node.id)).toBeUndefined();
	expect(content.tree.parserFormOwner(input.node.id)).toBeUndefined();
});

it("regroups radios when an explicit form attribute resets a parser owner", () => {
	const { tree, byId } = parse(
		"<table><form id=first><input id=one type=radio name=group checked></form><form id=second><input id=two type=radio name=group checked></table>",
	);
	tree.setAttribute(byId("one"), "form", "second");
	expect(controlChecked(tree, byId("one"))).toBe(true);
	expect(controlChecked(tree, byId("two"))).toBe(false);
});

it("regroups radios when a moved parser-associated control joins an ancestor form", () => {
	const { tree, byId } = parse(
		"<form id=other><input id=peer type=radio name=group checked></form><table><form id=form><input id=control type=radio name=group checked></table>",
	);
	tree.append(byId("other"), byId("control"));
	expect(controlChecked(tree, byId("control"))).toBe(true);
	expect(controlChecked(tree, byId("peer"))).toBe(false);
});

it("exposes the parser owner during native insertion notification", () => {
	const observed: boolean[] = [];
	const tree = parseHtmlDocument(
		"<table><form id=form><input id=control></table>",
		"https://example.com/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes) {
						if (owner.get(id).tagName !== "input") continue;
						const form = [...owner.walk()].find(
							({ node }) => node.tagName === "form",
						);
						if (!form) throw new Error("Missing form");
						observed.push(formOwner(owner, id) === form.node.id);
						observed.push(
							formControls(owner, form.node.id).some((node) => node.id === id),
						);
					}
				});
			},
		},
	);
	trees.push(tree);
	expect(observed).toEqual([true, true]);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("does not restore a parser override after a native insertion hook reparents the control", () => {
	let moved = false;
	const tree = parseHtmlDocument(
		"<form id=other></form><table><form id=form><input id=control></table>",
		"https://example.com/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					if (moved) return;
					const control = record.addedNodes.find(
						(id) => owner.get(id).tagName === "input",
					);
					if (control === undefined) return;
					const other = [...owner.walk()].find(
						({ node }) => node.attributes.id === "other",
					);
					if (!other) throw new Error("Missing other form");
					moved = true;
					owner.append(other.node.id, control);
				});
			},
		},
	);
	trees.push(tree);
	const control = [...tree.walk()].find(({ node }) => node.tagName === "input");
	if (!control) throw new Error("Missing control");
	expect(moved).toBe(true);
	expect(formOwner(tree, control.node.id)).toBe(control.node.parent);
	expect(tree.parserFormOwner(control.node.id)).toBeUndefined();
});

it("cleans up parser association storage after a script hook failure", async () => {
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<table><form id=form><input><script>fail</script>",
			"https://example.com/",
			{},
			{
				start(tree) {
					candidate = tree;
				},
				async script(owner) {
					const input = [...owner.walk()].find(
						({ node }) => node.tagName === "input",
					);
					if (!input) throw new Error("Missing input");
					expect(formOwner(owner, input.node.id)).toBeDefined();
					throw new Error("script failure");
				},
				async finish() {},
			},
		),
	).rejects.toThrow("script failure");
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
	expect(
		(candidate as unknown as { parserForms: Map<number, number> }).parserForms
			.size,
	).toBe(0);
});

function native() {
	const tree = new DocumentTree("https://example.com/", {
		maxTextCodeUnits: 100,
	});
	trees.push(tree);
	const parent = tree.createElement("div");
	tree.append(tree.root, parent);
	const form = tree.createElement("form");
	tree.append(parent, form);
	const control = tree.createElement("input");
	return { tree, parent, form, control };
}

it("rolls back prepared ownership when insertion validation fails", () => {
	const { tree, parent, form, control } = native();
	const outside = tree.createElement("span");
	expect(() =>
		tree.insertParserElement(parent, control, form, outside),
	).toThrow();
	expect(tree.get(control).parent).toBeNull();
	expect(tree.parserFormOwner(control)).toBeUndefined();
	tree.append(parent, control);
	expect(formOwner(tree, control)).toBeUndefined();
});

it("does not associate through an intended parent in a different native tree root", () => {
	const { tree, parent, form, control } = native();
	tree.remove(form);
	tree.insertParserElement(parent, control, form);
	expect(formOwner(tree, control)).toBeUndefined();
	expect(tree.parserFormOwner(control)).toBeUndefined();
});

it("rejects a foreign document's form identity", () => {
	const { tree, parent, control } = native();
	const foreign = new DocumentTree("https://other.example/");
	trees.push(foreign);
	const form = foreign.createElement("form");
	expect(() => tree.insertParserElement(parent, control, form)).toThrow();
	expect(tree.get(control).parent).toBeNull();
	expect(tree.parserFormOwner(control)).toBeUndefined();
});

it("rejects attached parser insertion candidates without replacing their owner", () => {
	const { tree, parent, form, control } = native();
	tree.insertParserElement(parent, control, form);
	expect(() => tree.insertParserElement(form, control, form)).toThrow(
		"Invalid parser form insertion",
	);
	expect(tree.get(control).parent).toBe(parent);
	expect(formOwner(tree, control)).toBe(form);
});

it("does not assign a form owner to an unsupported tag", () => {
	const { tree, parent, form } = native();
	const ordinary = tree.createElement("div");
	tree.insertParserElement(parent, ordinary, form);
	expect(tree.parserFormOwner(ordinary)).toBeUndefined();
	expect(formOwner(tree, ordinary)).toBeUndefined();
});

it("keeps the association when a form-attribute change fails its text quota", () => {
	const { tree, parent, form, control } = native();
	tree.insertParserElement(parent, control, form);
	expect(() => tree.setAttribute(control, "form", "x".repeat(100))).toThrow(
		"text limit",
	);
	expect(formOwner(tree, control)).toBe(form);
	expect(tree.parserFormOwner(control)).toBe(form);
});

it("bounds association storage by allocated native elements and clears it on close", () => {
	const tree = new DocumentTree("https://example.com/", { maxNodes: 4 });
	trees.push(tree);
	const parent = tree.createElement("div");
	tree.append(tree.root, parent);
	const form = tree.createElement("form");
	tree.append(parent, form);
	const control = tree.createElement("input");
	tree.insertParserElement(parent, control, form);
	const associations = (tree as unknown as { parserForms: Map<number, number> })
		.parserForms;
	expect(associations.size).toBe(1);
	expect(() => tree.createElement("input")).toThrow("node limit");
	tree.close();
	expect(associations.size).toBe(0);
	expect(() => tree.parserFormOwner(control)).toThrow("closed");
});

it("stops assigning the previous parser form after its end tag", () => {
	const { tree, byId } = parse(
		"<table><form id=form><input id=before></form><input id=after></table>",
	);
	expect(formOwner(tree, byId("before"))).toBe(byId("form"));
	expect(formOwner(tree, byId("after"))).toBeUndefined();
});

it("cancels and releases ownership after a parser write creates an association", async () => {
	const controller = new AbortController();
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<script>write</script>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start(tree) {
					candidate = tree;
				},
				async script(owner, _id, context) {
					context.write("<table><form><input>");
					const input = [...owner.walk()].find(
						({ node }) => node.tagName === "input",
					);
					if (!input) throw new Error("Missing input");
					expect(formOwner(owner, input.node.id)).toBeDefined();
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
	expect(
		(candidate as unknown as { parserForms: Map<number, number> }).parserForms
			.size,
	).toBe(0);
});
