import { afterEach, expect, it } from "vitest";
import { controlChecked, formOwner, setControlChecked } from "./controls.js";
import { type DocumentNode, DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptCollections } from "./script-collections.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const form = tree.createElement("form", { id: "form" });
	tree.append(tree.root, form);
	const add = (attributes: Record<string, string> = {}, parent = form) => {
		const id = tree.createElement("input", {
			type: "radio",
			name: "group",
			...attributes,
		});
		tree.append(parent, id);
		return id;
	};
	const checked = (...ids: number[]) =>
		ids.map((id) => controlChecked(tree, id));
	return { tree, form, add, checked };
}

it("selects a clean earlier radio when checked is added after a later default", () => {
	const { tree, add, checked } = fixture();
	const first = add();
	const second = add({ checked: "" });
	tree.setAttribute(first, "checked", "");
	expect(checked(first, second)).toEqual([true, false]);
});

it("does not resurrect an earlier checked attribute when the winner is removed", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add({ checked: "" });
	tree.remove(second);
	expect(checked(first, second)).toEqual([false, true]);
});

it("does not resurrect a default when the winning checked attribute is removed", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add({ checked: "" });
	tree.removeAttribute(second, "checked");
	expect(checked(first, second)).toEqual([false, false]);
});

it("makes native setControl exclusive without dirtying automatically unchecked peers", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add();
	tree.setControl(second, { checked: true });
	expect(checked(first, second)).toEqual([false, true]);
	tree.removeAttribute(first, "checked");
	tree.setAttribute(first, "checked", "");
	expect(checked(first, second)).toEqual([true, false]);
});

it("keeps clean peers clean when the shared checked action selects another radio", () => {
	const { tree, add, checked } = fixture();
	const first = add();
	const second = add();
	setControlChecked(tree, tree.reference(second), true);
	tree.setAttribute(first, "checked", "");
	expect(checked(first, second)).toEqual([true, false]);
});

it("preserves a clean automatic uncheck when cloning a radio", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	add({ checked: "" });
	const clone = tree.clone(first);
	expect(checked(clone)).toEqual([false]);
	tree.removeAttribute(clone, "checked");
	tree.setAttribute(clone, "checked", "");
	expect(checked(clone)).toEqual([true]);
});

it("a checked radio moved earlier into a group wins independently of tree order", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ checked: "" });
	const incoming = add({ checked: "" }, tree.createFragment());
	tree.insert(form, incoming, first);
	expect(checked(incoming, first)).toEqual([true, false]);
});

it("a checked radio entering a group by name change takes selection", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "", name: "other" });
	const second = add({ checked: "" });
	tree.setAttribute(first, "name", "group");
	expect(checked(first, second)).toEqual([true, false]);
});

it.each([false, true])(
	"preserves dirty checkedness across default mutations: %s",
	(value) => {
		const { tree, add, checked } = fixture();
		const id = add();
		tree.setInputChecked(id, value);
		tree.setAttribute(id, "checked", "");
		expect(checked(id)).toEqual([value]);
		tree.removeAttribute(id, "checked");
		expect(checked(id)).toEqual([value]);
	},
);

it("does not reselect a clean unchecked radio when only the checked attribute value changes", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "before" });
	const second = add({ checked: "" });
	tree.setAttribute(first, "checked", "after");
	expect(checked(first, second)).toEqual([false, true]);
});

it("updates frozen snapshots and checked selectors for automatic peer changes", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add();
	const snapshot = tree.get(first);
	const queries = new DocumentQueries(tree);
	expect(queries.matches(first, ":checked")).toBe(true);
	tree.setInputChecked(second, true);
	expect(tree.get(first)).not.toBe(snapshot);
	expect(snapshot.control.checked).toBeUndefined();
	expect(tree.get(first).control.checked).toBe(false);
	expect(queries.matches(first, ":checked")).toBe(false);
	expect(queries.matches(second, ":checked")).toBe(true);
	tree.setInputChecked(second, false);
	expect(checked(first, second)).toEqual([false, false]);
});

it.each(["name", "type"])(
	"preserves checkedness when leaving and entering a group through %s",
	(attribute) => {
		const { tree, add, checked } = fixture();
		const first = add({ checked: "" });
		const second = add({ checked: "" });
		tree.setAttribute(
			second,
			attribute,
			attribute === "name" ? "other" : "checkbox",
		);
		expect(checked(first, second)).toEqual([false, true]);
		tree.setInputChecked(first, true);
		tree.setAttribute(
			second,
			attribute,
			attribute === "name" ? "group" : "RADIO",
		);
		expect(checked(first, second)).toEqual([false, true]);
	},
);

it("keeps empty names independent and group names case-sensitive", () => {
	const { tree, add, checked } = fixture();
	const first = add({ name: "", checked: "" });
	const second = add({ name: "", checked: "" });
	const third = add({ name: "Group", checked: "" });
	const fourth = add({ name: "group", checked: "" });
	expect(checked(first, second, third, fourth)).toEqual([
		true,
		true,
		true,
		true,
	]);
	tree.setAttribute(first, "name", "group");
	expect(checked(first, second, third, fourth)).toEqual([
		true,
		true,
		true,
		false,
	]);
});

it("reconciles checked radios when explicit form ownership changes", () => {
	const { tree, add, checked } = fixture();
	const otherForm = tree.createElement("form", { id: "other" });
	tree.append(tree.root, otherForm);
	const external = add({ form: "other", checked: "" });
	const internal = add({ checked: "" });
	expect(checked(external, internal)).toEqual([true, true]);
	tree.setAttribute(external, "form", "form");
	expect(checked(external, internal)).toEqual([true, false]);
});

it("resolves a late form id and unchecks the former owner-group winner", () => {
	const { tree, form, add, checked } = fixture();
	const external = add({ form: "later", checked: "" }, tree.root);
	const internal = add({ checked: "" });
	expect(checked(external, internal)).toEqual([true, true]);
	tree.setAttribute(form, "id", "later");
	expect(formOwner(tree, external)).toBe(form);
	expect(checked(external, internal)).toEqual([true, false]);
});

it("uses the first matching id, including a non-form that masks a form", () => {
	const { tree, form, add, checked } = fixture();
	const blocker = tree.createElement("div", { id: "form" });
	tree.insert(tree.root, blocker, form);
	const external = add({ form: "form", checked: "" }, tree.root);
	const internal = add({ checked: "" });
	expect(formOwner(tree, external)).toBeUndefined();
	expect(checked(external, internal)).toEqual([true, true]);
	tree.remove(blocker);
	expect(formOwner(tree, external)).toBe(form);
	expect(checked(external, internal)).toEqual([true, false]);
});

it("keeps disconnected explicit-form controls with their nearest ancestor form", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ form: "missing", checked: "" });
	const second = add({ checked: "" });
	expect(checked(first, second)).toEqual([true, true]);
	tree.remove(form);
	expect(formOwner(tree, first)).toBe(form);
	expect(checked(first, second)).toEqual([true, false]);
});

it("does not select defaults across disconnected tree roots", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add({ checked: "" }, tree.createFragment());
	expect(checked(first, second)).toEqual([true, true]);
	tree.setInputChecked(second, false);
	expect(checked(first, second)).toEqual([true, false]);
});

it("preserves dirty flags through clone and cross-document copy", () => {
	const source = fixture();
	const target = fixture();
	const original = source.add();
	source.tree.setInputChecked(original, false);
	const clone = source.tree.clone(original);
	const imported = target.tree.copyFrom(source.tree, original);
	source.tree.setAttribute(clone, "checked", "");
	target.tree.setAttribute(imported, "checked", "");
	expect(source.checked(clone)).toEqual([false]);
	expect(target.checked(imported)).toEqual([false]);
	target.tree.clearControl(imported, ["checked"]);
	expect(target.checked(imported)).toEqual([true]);
});

it("copies a group's actual selected state rather than reselecting its defaults", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add({ checked: "" });
	tree.setInputChecked(second, false);
	const clone = tree.clone(form, true);
	expect(checked(...tree.get(clone).children)).toEqual([false, false]);
	expect(checked(first, second)).toEqual([false, false]);
});

it("updates checkedness through attached Attr mutation and replacement", () => {
	const { tree, add, checked } = fixture();
	const first = add();
	const second = add({ checked: "" });
	const attribute = tree.createAttribute("checked");
	tree.setAttributeNode(first, attribute);
	expect(checked(first, second)).toEqual([true, false]);
	tree.removeAttributeNode(first, attribute);
	expect(checked(first, second)).toEqual([false, false]);
	tree.setAttributeNode(second, attribute);
	expect(checked(first, second)).toEqual([false, false]);
});

it("resets defaults in tree order and makes reset controls clean again", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ checked: "", value: "first" });
	const second = add({ checked: "", value: "second" });
	const forms = new DocumentForms(tree, new DocumentEvents(tree));
	tree.setInputChecked(first, true);
	expect(
		new URL(
			prepareFormSubmission(tree, tree.reference(form)).request.url,
		).searchParams.get("group"),
	).toBe("first");
	forms.reset(tree.reference(form));
	expect(checked(first, second)).toEqual([false, true]);
	tree.removeAttribute(first, "checked");
	tree.setAttribute(first, "checked", "");
	expect(checked(first, second)).toEqual([true, false]);
});

function factory(definition: ScriptHostObjectDefinition) {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(target, name, { value: method });
	return target;
}

it("script checked/defaultChecked setters share native clean-peer behavior", () => {
	const { tree, add, checked } = fixture();
	const first = add();
	const second = add();
	const dom = new ScriptDom(tree, { createHostObject: factory });
	const firstNode = dom.node(first) as { defaultChecked: boolean };
	const secondNode = dom.node(second) as { checked: boolean };
	secondNode.checked = true;
	firstNode.defaultChecked = true;
	expect(checked(first, second)).toEqual([true, false]);
});

it("RadioNodeList value writes do not dirty unselected peers", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ value: "first" });
	const second = add({ value: "second" });
	const collections = new ScriptCollections(
		tree,
		{ createHostObject: factory },
		(id) => id,
	);
	try {
		const group = collections.get(form, "form-named", "group") as {
			value: string;
		};
		group.value = "second";
		expect(group.value).toBe("second");
		tree.setAttribute(first, "checked", "");
		expect(checked(first, second)).toEqual([true, false]);
		expect(group.value).toBe("first");
	} finally {
		collections.close();
	}
});

it("canceling activation restores the previous radio without dirtying it", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add();
	const actions = new DocumentInteractions(tree);
	actions.events.addEventListener(second, "click", (event) =>
		event.preventDefault(),
	);
	actions.click(tree.reference(second));
	expect(checked(first, second)).toEqual([true, false]);
	tree.removeAttribute(first, "checked");
	expect(checked(first, second)).toEqual([false, false]);
});

it("rejects invalid setters and failed attribute allocation without disturbing the winner", () => {
	const { tree, add, checked } = fixture();
	const first = add();
	const second = add({ checked: "" });
	const revision = tree.revision;
	expect(() => tree.setInputChecked(first, 1 as unknown as boolean)).toThrow(
		/Invalid input/,
	);
	expect(() =>
		tree.setInputChecked(first, true, "dirty" as unknown as boolean),
	).toThrow(/Invalid input/);
	expect(() =>
		tree.setAttribute(
			first,
			"checked",
			"x".repeat(tree.limits.maxTextCodeUnits + 1),
		),
	).toThrow(/text limit/);
	expect(tree.revision).toBe(revision);
	expect(checked(first, second)).toEqual([false, true]);
});

it("revokes retained checked access on document closure", () => {
	const { tree, add } = fixture();
	const id = add();
	tree.close();
	expect(() => tree.setInputChecked(id, true)).toThrow(/closed/);
	expect(() => controlChecked(tree, id)).toThrow(/closed/);
});

it("switches a large group's winner with constant native node work", () => {
	const { tree, add, checked } = fixture();
	const first = add({ checked: "" });
	let last = first;
	for (let index = 0; index < 2000; index++) last = add();
	const internals = tree as unknown as { node(id: number): DocumentNode };
	const original = internals.node.bind(tree);
	let reads = 0;
	internals.node = (id) => {
		reads++;
		return original(id);
	};
	tree.setInputChecked(last, true);
	expect(reads).toBeLessThanOrEqual(6);
	expect(checked(first, last)).toEqual([false, true]);
});

it("preserves parser-selected state after removing or resetting the winner", () => {
	const tree = parseHtmlDocument(
		"<form><input type=radio name=group checked><input type=radio name=group checked></form>",
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const radios = queries.querySelectorAll("input");
	expect(radios).toHaveLength(2);
	expect(radios.map((id) => controlChecked(tree, id))).toEqual([false, true]);
	tree.remove(radios[1]);
	expect(controlChecked(tree, radios[0])).toBe(false);
	tree.clearControl(radios[0], ["checked"]);
	expect(controlChecked(tree, radios[0])).toBe(true);
});

it("does not change dirty flags or peers when a native clone exceeds its node quota", () => {
	const tree = new DocumentTree("about:blank", { maxNodes: 4 });
	documents.push(tree);
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	const first = tree.createElement("input", {
		type: "radio",
		name: "group",
		checked: "",
	});
	const second = tree.createElement("input", {
		type: "radio",
		name: "group",
		checked: "",
	});
	tree.append(form, first);
	tree.append(form, second);
	const revision = tree.revision;
	expect(() => tree.clone(form, true)).toThrow(/node limit/);
	expect(tree.revision).toBe(revision);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(true);
	tree.removeAttribute(first, "checked");
	tree.setAttribute(first, "checked", "");
	expect(controlChecked(tree, first)).toBe(true);
});

it("reconciles external references when a form subtree is inserted and removed", () => {
	const { tree, add, checked } = fixture();
	const container = tree.createElement("section");
	const lateForm = tree.createElement("form", { id: "late" });
	tree.append(container, lateForm);
	const internal = add({ checked: "" }, lateForm);
	const external = add({ checked: "", form: "late" }, tree.root);
	tree.append(tree.root, container);
	expect(formOwner(tree, external)).toBe(lateForm);
	expect(checked(internal, external).filter(Boolean)).toHaveLength(1);
	tree.setInputChecked(external, true);
	tree.remove(container);
	expect(formOwner(tree, external)).toBeUndefined();
	expect(checked(internal, external)).toEqual([false, true]);
});

it("does not alter radio defaults when reset is canceled", () => {
	const { tree, form, add, checked } = fixture();
	const first = add({ checked: "" });
	const second = add();
	tree.setInputChecked(second, true);
	const events = new DocumentEvents(tree);
	events.addEventListener(form, "reset", (event) => event.preventDefault());
	const forms = new DocumentForms(tree, events);
	expect(forms.reset(tree.reference(form)).canceled).toBe(true);
	expect(checked(first, second)).toEqual([false, true]);
	tree.removeAttribute(first, "checked");
	tree.setAttribute(first, "checked", "");
	expect(checked(first, second)).toEqual([true, false]);
});

it("matches an independent flat-group model across 500 dirty/default/name transitions", () => {
	const { tree, add, checked } = fixture();
	const ids = Array.from({ length: 6 }, () => add());
	const states = ids.map(() => ({
		checked: false,
		dirty: false,
		defaultChecked: false,
		name: "group",
	}));
	let seed = 17;
	const random = () => {
		seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
		return seed >>> 8;
	};
	const select = (target: number) => {
		if (!states[target].checked || !states[target].name) return;
		for (let index = 0; index < states.length; index++)
			if (index !== target && states[index].name === states[target].name)
				states[index].checked = false;
	};
	for (let step = 0; step < 500; step++) {
		const target = random() % ids.length;
		const state = states[target];
		const value = Boolean(random() % 2);
		switch (step % 5) {
			case 0:
				tree.setInputChecked(ids[target], value);
				state.checked = value;
				state.dirty = true;
				select(target);
				break;
			case 1:
			case 2: {
				const present = step % 5 === 1;
				if (present)
					tree.setAttribute(ids[target], "checked", value ? "yes" : "");
				else tree.removeAttribute(ids[target], "checked");
				if (state.defaultChecked !== present && !state.dirty) {
					state.checked = present;
					select(target);
				}
				state.defaultChecked = present;
				break;
			}
			case 3:
				tree.clearControl(ids[target], ["checked"]);
				state.dirty = false;
				state.checked = state.defaultChecked;
				select(target);
				break;
			case 4:
				state.name = ["group", "other", ""][random() % 3];
				tree.setAttribute(ids[target], "name", state.name);
				select(target);
				break;
		}
		expect(checked(...ids), `step ${step}`).toEqual(
			states.map((entry) => entry.checked),
		);
	}
});
