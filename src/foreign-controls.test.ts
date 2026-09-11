import { afterEach, expect, it, vi } from "vitest";
import {
	contentEditableState,
	isContentEditable,
	isRootEditableElement,
} from "./content-editability.js";
import { textareaDefaultValue } from "./control-defaults.js";
import { lengthApplies, lengthValidity } from "./control-length.js";
import { describeControl } from "./control-rendering.js";
import { controlTextState } from "./control-text-state.js";
import { controlValidity } from "./control-validity.js";
import {
	controlChecked,
	controlShowsPlaceholder,
	controlValue,
	fillTextControl,
	formControls,
	formOwner,
	isControlDisabled,
	isInsideDatalist,
	isInteractiveElement,
	isLabelable,
	isTextControl,
	labelControl,
	optionLabel,
	optionOwner,
	optionSelected,
	optionText,
	optionValue,
	radioGroup,
	selectControlValues,
	selectOptions,
	selectedOptions,
	setControlChecked,
	setControlCheckedState,
} from "./controls.js";
import {
	closedDetailsChild,
	firstDetailsSummary,
	summaryDetails,
} from "./details.js";
import { DocumentSelectedContent } from "./document-selectedcontent.js";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	parsedTabIndex,
	scriptElementFocusProperties,
} from "./element-focus.js";
import { supportsFocusKeyboardInput } from "./focus-indication.js";
import { focusTabIndex } from "./focus.js";
import {
	invalidControl,
	isValidationCandidate,
	validationMessage,
} from "./form-validation.js";
import { inputType } from "./input-values.js";
import { DocumentInteractions } from "./interactions.js";
import {
	nativeControlCaret,
	readNativeControlSelection,
} from "./native-control-caret.js";
import { optionDisabled } from "./option-disabled.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/foreign-controls");
	documents.push(tree);
	const add = (
		tagName: string,
		attributes: Record<string, string> = {},
		parent = tree.root,
		namespaceURI = htmlNamespace,
	) => {
		const id = tree.createParserElement(tagName, attributes, namespaceURI);
		tree.append(parent, id);
		return id;
	};
	return { tree, add };
}

it.each([svgNamespace, mathmlNamespace])(
	"does not assign HTML control state or defaults to collisions in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const form = add("form");
		const datalist = add("datalist", {}, form);
		for (const tagName of [
			"input",
			"textarea",
			"select",
			"option",
			"optgroup",
			"button",
			"fieldset",
			"label",
			"form",
			"details",
			"summary",
			"meter",
			"output",
			"progress",
			"a",
			"audio",
			"video",
			"img",
			"object",
		]) {
			const id = add(
				tagName,
				{
					type: "radio",
					name: "same",
					value: "foreign",
					checked: "",
					selected: "",
					disabled: "",
					placeholder: "hint",
					href: "/",
					controls: "",
					usemap: "#map",
					contenteditable: "true",
				},
				datalist,
				namespaceURI,
			);
			const node = tree.get(id);
			expect(node.control).toEqual({});
			expect(isLabelable(node)).toBe(false);
			expect(isInteractiveElement(node)).toBe(false);
			expect(isTextControl(node)).toBe(false);
			expect(inputType(node)).toBe("");
			expect(controlValue(tree, id)).toBe("");
			expect(controlChecked(tree, id)).toBe(false);
			expect(controlShowsPlaceholder(tree, id)).toBe(false);
			expect(isControlDisabled(tree, id)).toBe(false);
			expect(isInsideDatalist(tree, id)).toBe(false);
			expect(formOwner(tree, id)).toBeUndefined();
			expect(selectOptions(tree, id)).toEqual([]);
			expect(selectedOptions(tree, id)).toEqual([]);
			expect(optionSelected(tree, id)).toBe(false);
			expect(optionOwner(tree, id)).toBeUndefined();
			expect(optionValue(tree, id)).toBe("");
			expect(optionLabel(tree, id)).toBe("");
			expect(optionText(tree, id)).toBe("");
			expect(optionDisabled(node, (target) => tree.get(target))).toBe(false);
			expect(supportsFocusKeyboardInput(tree, id)).toBe(false);
		}
		expect(formControls(tree, form)).toEqual([]);
	},
);

it.each([
	[svgNamespace, "foreignObject"],
	[mathmlNamespace, "annotation-xml"],
])(
	"retains HTML controls below %s integration nodes",
	(namespaceURI, tagName) => {
		const { tree, add } = fixture();
		const form = add("form");
		const integration = add(tagName, {}, form, namespaceURI);
		const foreignForm = add("form", {}, integration, namespaceURI);
		const fieldset = add(
			"fieldset",
			{ disabled: "" },
			foreignForm,
			namespaceURI,
		);
		const label = add("label", {}, fieldset);
		add("input", {}, label, namespaceURI);
		const input = add("input", { placeholder: "hint" }, label);
		const textarea = add("textarea", {}, fieldset);
		tree.append(textarea, tree.createText("default\r\ntext"));
		const select = add("select", {}, fieldset);
		const option = add("option", { value: "html" }, select);
		expect(formControls(tree, form).map((node) => node.id)).toEqual([
			input,
			textarea,
			select,
		]);
		expect(formOwner(tree, input)).toBe(form);
		expect(isControlDisabled(tree, input)).toBe(false);
		expect(labelControl(tree, label)).toBe(input);
		expect(isLabelable(tree.get(input))).toBe(true);
		expect(isInteractiveElement(tree.get(input))).toBe(true);
		expect(controlShowsPlaceholder(tree, input)).toBe(true);
		expect(supportsFocusKeyboardInput(tree, input)).toBe(true);
		expect(controlValue(tree, textarea)).toBe("default\ntext");
		expect(optionSelected(tree, option)).toBe(true);
		expect(controlValue(tree, select)).toBe("html");
		fillTextControl(tree, tree.reference(input), "typed\nvalue");
		expect(controlValue(tree, input)).toBe("typedvalue");
		tree.setAttribute(input, "readonly", "");
		expect(supportsFocusKeyboardInput(tree, input)).toBe(false);
	},
);

it("guards fieldset, legend and datalist ancestors without breaking inheritance", () => {
	const { tree, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const foreignLegend = add("legend", {}, fieldset, svgNamespace);
	const blocked = add("input", {}, foreignLegend);
	const legend = add("legend", {}, fieldset);
	const foreignWrapper = add(
		"fieldset",
		{ disabled: "" },
		legend,
		svgNamespace,
	);
	const allowed = add("input", {}, foreignWrapper);
	const wrapper = add("foreignObject", {}, fieldset, svgNamespace);
	const inherited = add("input", {}, wrapper);
	expect(isControlDisabled(tree, blocked)).toBe(true);
	expect(isControlDisabled(tree, allowed)).toBe(false);
	expect(isControlDisabled(tree, inherited)).toBe(true);
	tree.append(legend, inherited);
	expect(isControlDisabled(tree, inherited)).toBe(false);
	tree.removeAttribute(fieldset, "disabled");
	expect(isControlDisabled(tree, blocked)).toBe(false);
	const foreignDatalist = add("datalist", {}, tree.root, mathmlNamespace);
	tree.append(foreignDatalist, allowed);
	expect(isInsideDatalist(tree, allowed)).toBe(false);
	const datalist = add("datalist");
	tree.append(datalist, foreignDatalist);
	expect(isInsideDatalist(tree, allowed)).toBe(true);
});

it("preserves parser ownership of a detached HTML form", () => {
	const { tree, add } = fixture();
	const form = add("form");
	const parent = add("div");
	const input = tree.createElement("input");
	tree.insertParserElement(parent, input, form);
	expect(formOwner(tree, input)).toBe(form);
	tree.remove(form);
	expect(tree.parserFormOwner(input)).toBe(form);
	expect(formOwner(tree, input)).toBe(form);
	expect(tree.get(form).parent).toBeNull();
	tree.remove(input);
	expect(tree.parserFormOwner(input)).toBeUndefined();
	expect(formOwner(tree, input)).toBeUndefined();
});

it("uses first ID matches without treating foreign forms or labels as HTML owners", () => {
	const { tree, add } = fixture();
	const collision = add("form", { id: "owner" }, tree.root, svgNamespace);
	const form = add("form", { id: "owner" });
	const input = add("input", { form: "owner", id: "target" });
	const label = add("label", { for: "target" });
	const foreignLabel = add(
		"label",
		{ for: "target" },
		tree.root,
		mathmlNamespace,
	);
	expect(formOwner(tree, input)).toBeUndefined();
	expect(formControls(tree, form)).toEqual([]);
	expect(labelControl(tree, label)).toBe(input);
	expect(() => labelControl(tree, foreignLabel)).toThrow(/label/i);
	expect(() => formControls(tree, collision)).toThrow(/form/i);
	tree.setAttribute(collision, "id", "foreign");
	expect(formOwner(tree, input)).toBe(form);
	expect(formControls(tree, form).map((node) => node.id)).toEqual([input]);
	tree.setAttribute(collision, "id", "owner");
	expect(formOwner(tree, input)).toBeUndefined();
	tree.remove(collision);
	expect(formOwner(tree, input)).toBe(form);
	const foreignInput = add("input", { id: "target" }, tree.root, svgNamespace);
	tree.insert(tree.root, foreignInput, input);
	expect(labelControl(tree, label)).toBeUndefined();
	tree.remove(foreignInput);
	expect(labelControl(tree, label)).toBe(input);
});

it("keeps foreign radios out of groups through checkedness, ownership and ID mutations", () => {
	const { tree, add } = fixture();
	const form = add("form", { id: "owner" });
	const foreignForm = add("form", {}, form, svgNamespace);
	const first = add(
		"input",
		{ type: "radio", name: "group", checked: "" },
		foreignForm,
	);
	const foreign = add(
		"input",
		{ type: "radio", name: "group", checked: "" },
		form,
		mathmlNamespace,
	);
	const second = add(
		"input",
		{ type: "radio", name: "group", checked: "" },
		form,
	);
	expect(radioGroup(tree, first).map((node) => node.id)).toEqual([
		first,
		second,
	]);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(true);
	tree.setAttribute(foreign, "checked", "again");
	tree.setAttribute(foreign, "type", "checkbox");
	expect(tree.get(foreign).control).toEqual({});
	expect(controlChecked(tree, second)).toBe(true);
	const otherForm = add("form");
	tree.append(otherForm, first);
	setControlCheckedState(tree, first, true);
	expect(controlChecked(tree, second)).toBe(true);
	tree.setAttribute(first, "form", "owner");
	expect(controlChecked(tree, second)).toBe(false);
	tree.setAttribute(foreignForm, "id", "owner");
	tree.insert(tree.root, foreignForm, form);
	expect(formOwner(tree, first)).toBeUndefined();
	setControlCheckedState(tree, second, true);
	expect(controlChecked(tree, first)).toBe(true);
	tree.remove(foreignForm);
	expect(formOwner(tree, first)).toBe(form);
	expect(controlChecked(tree, second)).toBe(false);
});

it.each([svgNamespace, mathmlNamespace])(
	"ignores foreign option owners, blockers and disabled optgroups in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const select = add("select");
		const foreignOption = add(
			"option",
			{ selected: "", value: "foreign" },
			select,
			namespaceURI,
		);
		let parent = select;
		for (const tagName of [
			"select",
			"datalist",
			"hr",
			"option",
			"optgroup",
			"optgroup",
		])
			parent = add(tagName, { disabled: "" }, parent, namespaceURI);
		const first = add("option", { value: "first" }, parent);
		const optgroup = add("optgroup", { disabled: "" }, parent);
		const second = add("option", { value: "second" }, optgroup);
		expect(selectOptions(tree, select).map((node) => node.id)).toEqual([
			first,
			second,
		]);
		expect(optionOwner(tree, foreignOption)).toBeUndefined();
		expect(tree.get(foreignOption).control).toEqual({});
		expect(optionOwner(tree, first)).toBe(select);
		expect(optionSelected(tree, first)).toBe(true);
		expect(isControlDisabled(tree, first)).toBe(false);
		expect(isControlDisabled(tree, second)).toBe(true);
		tree.setAttribute(parent, "disabled", "again");
		expect(optionSelected(tree, first)).toBe(true);
		tree.setAttribute(foreignOption, "selected", "again");
		expect(tree.get(foreignOption).control).toEqual({});
		tree.removeAttribute(optgroup, "disabled");
		selectControlValues(tree, tree.reference(select), ["second"]);
		expect(controlValue(tree, select)).toBe("second");
		const other = add("select");
		tree.append(other, parent);
		expect(selectOptions(tree, select)).toEqual([]);
		expect(optionOwner(tree, first)).toBe(other);
		expect(controlValue(tree, other)).toBe("second");
		const clone = tree.clone(other, true);
		expect(controlValue(tree, clone)).toBe("second");
		tree.setSelectSelection(other, [first], true);
		expect(controlValue(tree, other)).toBe("first");
		expect(controlValue(tree, clone)).toBe("second");
	},
);

it("keeps foreign input value mutations out of default and dirty state", () => {
	const { tree, add } = fixture();
	for (const namespaceURI of [svgNamespace, mathmlNamespace]) {
		const input = add(
			"input",
			{ type: "text", value: "default\nvalue" },
			tree.root,
			namespaceURI,
		);
		for (const type of [
			"range",
			"color",
			"email",
			"checkbox",
			"file",
			"text",
		]) {
			tree.setAttribute(input, "type", type);
			tree.setAttribute(input, "min", "10");
			tree.setAttribute(input, "max", "20");
			tree.setAttribute(input, "step", "2");
			tree.setAttribute(input, "multiple", "");
			expect(tree.get(input).control).toEqual({});
			expect(tree.get(input).attributes.value).toBe("default\nvalue");
			expect(controlValue(tree, input)).toBe("");
		}
		tree.removeAttribute(input, "value");
		expect(tree.get(input).control).toEqual({});
		expect(tree.get(tree.clone(input)).control).toEqual({});
	}
});

it("limits disclosure grouping, summaries and closed content to HTML details", () => {
	const { tree, add } = fixture();
	const details = add("details", { name: "group", open: "" });
	const foreignSummary = add("summary", {}, details, svgNamespace);
	const summary = add("summary", {}, details);
	const content = add("div", {}, details);
	const foreign = add(
		"details",
		{ name: "group", open: "" },
		tree.root,
		mathmlNamespace,
	);
	const nestedSummary = add("summary", {}, foreign);
	expect(firstDetailsSummary(tree, tree.get(details))).toBe(summary);
	expect(summaryDetails(tree, tree.get(foreignSummary))).toBeUndefined();
	expect(summaryDetails(tree, tree.get(summary))).toBe(details);
	expect(summaryDetails(tree, tree.get(nestedSummary))).toBeUndefined();
	const charge = vi.fn();
	expect(firstDetailsSummary(tree, tree.get(foreign), charge)).toBeNull();
	expect(charge).not.toHaveBeenCalled();
	expect(tree.get(details).attributes.open).toBe("");
	tree.removeAttribute(foreign, "open");
	expect(closedDetailsChild(tree, tree.get(nestedSummary))).toBe(false);
	tree.removeAttribute(details, "open");
	expect(closedDetailsChild(tree, tree.get(summary))).toBe(false);
	expect(closedDetailsChild(tree, tree.get(foreignSummary))).toBe(true);
	expect(closedDetailsChild(tree, tree.get(content))).toBe(true);
	tree.remove(summary);
	const replacement = add("summary", {}, details);
	expect(firstDetailsSummary(tree, tree.get(details))).toBe(replacement);
	const integration = add("foreignObject", {}, foreign, svgNamespace);
	const nested = add("details", { name: "group", open: "" }, integration);
	tree.setAttribute(details, "open", "");
	expect(tree.get(nested).attributes.open).toBeUndefined();
	tree.setAttribute(foreign, "open", "");
	expect(tree.get(details).attributes.open).toBe("");
});

it("ignores foreign contenteditable ancestors for HTML keyboard focus indication", () => {
	const { tree, add } = fixture();
	const outer = add("div");
	const foreign = add(
		"foreignObject",
		{ contenteditable: "true" },
		outer,
		svgNamespace,
	);
	const inner = add("div", {}, foreign);
	expect(supportsFocusKeyboardInput(tree, inner)).toBe(false);
	tree.setAttribute(outer, "contenteditable", "true");
	tree.setAttribute(foreign, "contenteditable", "false");
	expect(supportsFocusKeyboardInput(tree, inner)).toBe(true);
	expect(supportsFocusKeyboardInput(tree, foreign)).toBe(false);
	tree.setAttribute(inner, "contenteditable", "false");
	expect(supportsFocusKeyboardInput(tree, inner)).toBe(false);
});

it.each([svgNamespace, mathmlNamespace])(
	"clones selected content only into HTML targets across foreign ancestors in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const select = add("select");
		const foreignContent = add("selectedcontent", {}, select, namespaceURI);
		const retained = tree.createText("keep foreign content");
		tree.append(foreignContent, retained);
		const foreignOption = add("option", { selected: "" }, select, namespaceURI);
		tree.append(foreignOption, tree.createText("not selected"));
		const option = add("option", {}, select);
		const source = add(
			"input",
			{ value: "foreign value" },
			option,
			namespaceURI,
		);
		let parent = select;
		for (const tagName of ["select", "option", "selectedcontent"])
			parent = add(tagName, {}, parent, namespaceURI);
		const content = add("selectedcontent", {}, parent);
		const next = add("selectedcontent", {}, select);
		tree.setSelectSelection(select, [option]);
		const copy = tree.get(content).children[0];
		expect(copy).toBeDefined();
		expect(copy).not.toBe(source);
		expect(tree.get(copy).namespaceURI).toBe(namespaceURI);
		expect(tree.get(copy).control).toEqual({});
		expect(tree.get(foreignContent).children).toEqual([retained]);
		expect(tree.get(next).children).toEqual([]);
		const revision = tree.revision;
		const resources = tree.resourceUsage();
		tree.finishParserOption(foreignOption);
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(resources);
		tree.remove(content);
		expect(tree.get(next).children).toHaveLength(1);
		expect(tree.get(tree.get(next).children[0]).namespaceURI).toBe(
			namespaceURI,
		);
		expect(tree.get(foreignContent).children).toEqual([retained]);
	},
);

it("does not update or allocate selected content for a foreign select", () => {
	const { tree, add } = fixture();
	const select = add("select", {}, tree.root, svgNamespace);
	const content = add("selectedcontent", {}, select);
	const retained = tree.createText(
		"retain HTML content without an HTML select",
	);
	tree.append(content, retained);
	const option = add("option", { selected: "" }, select);
	tree.append(option, tree.createText("not owned"));
	const selectedContent = new DocumentSelectedContent(tree, (id) =>
		tree.get(id),
	);
	selectedContent.created("selectedcontent");
	const revision = tree.revision;
	const resources = tree.resourceUsage();
	const cached = tree.get(content);
	selectedContent.update(select);
	selectedContent.connected(content);
	selectedContent.optionClosed(option);
	selectedContent.removed(content, select);
	expect(tree.get(content)).toBe(cached);
	expect(tree.get(content).children).toEqual([retained]);
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(resources);
	selectedContent.close();
});

it.each([svgNamespace, mathmlNamespace])(
	"rejects HTML focus, validity and rendering dispatch before caching foreign collisions in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const targets = [
			"input",
			"textarea",
			"select",
			"button",
			"fieldset",
			"object",
			"output",
			"a",
			"details",
			"summary",
		].map((tagName) =>
			add(
				tagName,
				{
					required: "",
					tabindex: "0",
					href: "/next",
					contenteditable: "true",
					maxlength: "1",
					minlength: "10",
					value: "value",
					placeholder: "hint",
				},
				tree.root,
				namespaceURI,
			),
		);
		const revision = tree.revision;
		const resources = tree.resourceUsage();
		const onClose = vi.spyOn(tree, "onClose");
		const onChange = vi.spyOn(tree, "onChange");
		const invalidate = vi.spyOn(tree, "invalidatePresentation");
		for (const id of targets) {
			const node = tree.get(id);
			expect(contentEditableState(node)).toBe("inherit");
			expect(isContentEditable(tree, id)).toBe(false);
			expect(isRootEditableElement(tree, id)).toBe(false);
			expect(parsedTabIndex(node)).toBeNull();
			expect(focusTabIndex(tree, id)).toBeNull();
			const properties = scriptElementFocusProperties(
				tree,
				id,
				() => tree.get(id),
				String,
			);
			expect(properties.tabIndex.get()).toBe(-1);
			expect(properties.contentEditable.get()).toBe("inherit");
			expect(properties.isContentEditable.get()).toBe(false);
			expect(lengthApplies(node)).toBe(false);
			expect(lengthValidity(node, "value", true)).toEqual({
				tooLong: false,
				tooShort: false,
			});
			expect(isValidationCandidate(tree, id)).toBe(false);
			expect(invalidControl(tree, id)).toBeUndefined();
			expect(validationMessage(tree, id)).toBe("");
			expect(() => controlValidity(tree, id)).toThrow(
				/HTML validation control/,
			);
			expect(() => textareaDefaultValue(tree, id)).toThrow(/textarea/);
			expect(describeControl(tree, id, 16)).toBeUndefined();
			expect(controlTextState(tree, id)).toBeUndefined();
			expect(readNativeControlSelection(tree, id)).toBeUndefined();
			expect(tree.get(id)).toBe(node);
		}
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(resources);
		expect(onClose).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"rejects foreign actions without moving focus, notifying listeners or allocating a caret in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const active = add("input", { value: "kept" });
		const input = add("input", { type: "checkbox" }, tree.root, namespaceURI);
		const textarea = add(
			"textarea",
			{ tabindex: "0" },
			tree.root,
			namespaceURI,
		);
		const select = add("select", { tabindex: "0" }, tree.root, namespaceURI);
		const actions = new DocumentInteractions(tree);
		actions.focus.focus(tree.reference(active));
		const notifications = vi.fn();
		for (const type of [
			"focus",
			"blur",
			"beforeinput",
			"input",
			"change",
			"invalid",
		])
			actions.events.addEventListener(tree.root, type, notifications, {
				capture: true,
			});
		const onClose = vi.spyOn(tree, "onClose");
		const onChange = vi.spyOn(tree, "onChange");
		const invalidate = vi.spyOn(tree, "invalidatePresentation");
		const revision = tree.revision;
		const resources = tree.resourceUsage();
		const mutations = tree.mutationMetrics();
		const cached = [active, input, textarea, select].map((id) => tree.get(id));
		for (const operation of [
			() => actions.fill(tree.reference(textarea), "changed"),
			() => actions.select(tree.reference(select), []),
			() => actions.setChecked(tree.reference(input), true),
			() => actions.focus.focus(tree.reference(textarea)),
			() => actions.keyboard.collapseEnd(textarea),
			() => actions.keyboard.placeControlCaret(textarea, 0),
		]) {
			expect(operation).toThrow();
			expect(tree.activeElement).toBe(active);
			expect(tree.revision).toBe(revision);
			expect(tree.resourceUsage()).toEqual(resources);
			expect(tree.mutationMetrics()).toEqual(mutations);
			for (const node of cached) expect(tree.get(node.id)).toBe(node);
		}
		actions.focus.focusElement(textarea);
		expect(tree.activeElement).toBe(active);
		expect(tree.revision).toBe(revision);
		expect(notifications).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	},
);

it("rejects foreign caret targets even when installed by the low-level focus setter", () => {
	const { tree, add } = fixture();
	const input = add("input", { value: "kept" });
	const foreign = add("textarea", {}, tree.root, svgNamespace);
	tree.setActiveElement(input);
	const caret = nativeControlCaret(tree);
	const selection = caret.select(input, 1, 3);
	tree.setActiveElement(foreign);
	const revision = tree.revision;
	const resources = tree.resourceUsage();
	const mutations = tree.mutationMetrics();
	const invalidate = vi.spyOn(tree, "invalidatePresentation");
	for (const operation of [
		() => caret.selection(foreign),
		() => caret.collapse(foreign),
		() => caret.select(foreign, 0, 0),
	])
		expect(operation).toThrow(/caret target/);
	expect(caret.has(foreign)).toBe(false);
	expect(readNativeControlSelection(tree, foreign)).toBeUndefined();
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(resources);
	expect(tree.mutationMetrics()).toEqual(mutations);
	expect(invalidate).not.toHaveBeenCalled();
	tree.setActiveElement(input);
	expect(caret.selection(input)).toBe(selection);
});

it.each([svgNamespace, mathmlNamespace])(
	"keeps generic foreign clicks without HTML activation in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const form = add("form");
		const input = add("input", { id: "html", type: "checkbox" }, form);
		const actions = new DocumentInteractions(tree);
		for (const tagName of ["input", "button", "label", "a", "summary"]) {
			const foreign = add(
				tagName,
				{
					type: "checkbox",
					for: "html",
					href: "/next",
					checked: "",
					disabled: "",
				},
				form,
				namespaceURI,
			);
			const clicked = vi.fn();
			actions.events.addEventListener(foreign, "click", clicked);
			const result = actions.programmaticClick(foreign);
			expect(clicked).toHaveBeenCalledOnce();
			expect(result.defaultAction).toBeUndefined();
			expect(result.label).toBeUndefined();
			expect(result.reset).toBeUndefined();
			expect(tree.get(foreign).control).toEqual({});
			expect(controlChecked(tree, input)).toBe(false);
		}
	},
);

it("finds HTML activation ancestors past foreign interactive-name collisions", () => {
	const { tree, add } = fixture();
	const form = add("form");
	const input = add("input", { id: "html", type: "checkbox" }, form);
	const label = add("label", { for: "html" }, form);
	const foreignLabel = add("label", { for: "missing" }, label, svgNamespace);
	const icon = add("input", { type: "checkbox" }, foreignLabel, svgNamespace);
	const button = add("button", {}, form);
	const foreignLink = add(
		"a",
		{ href: "/not-a-navigation" },
		button,
		mathmlNamespace,
	);
	const actions = new DocumentInteractions(tree);
	expect(actions.programmaticClick(icon).label).toMatchObject({
		controlRef: tree.reference(input),
		forwarded: true,
	});
	expect(controlChecked(tree, input)).toBe(true);
	expect(tree.get(icon).control).toEqual({});
	expect(actions.programmaticClick(foreignLink).defaultAction).toEqual({
		kind: "submit",
		formRef: tree.reference(form),
		submitterRef: tree.reference(button),
	});
});

it("keeps HTML contenteditable inheritance and roots across foreign ancestors", () => {
	const { tree, add } = fixture();
	const outer = add("div", { contenteditable: "true" });
	const foreign = add(
		"foreignObject",
		{ contenteditable: "false" },
		outer,
		svgNamespace,
	);
	const inner = add("div", { contenteditable: "true" }, foreign);
	const text = tree.createText("editable text");
	tree.append(inner, text);
	expect(contentEditableState(tree.get(foreign))).toBe("inherit");
	expect(isContentEditable(tree, foreign)).toBe(false);
	expect(isRootEditableElement(tree, foreign)).toBe(false);
	expect(isContentEditable(tree, inner)).toBe(true);
	expect(isContentEditable(tree, text)).toBe(true);
	expect(isRootEditableElement(tree, inner)).toBe(false);
	tree.setAttribute(outer, "contenteditable", "false");
	tree.setAttribute(foreign, "contenteditable", "true");
	expect(isRootEditableElement(tree, inner)).toBe(true);
	tree.removeAttribute(inner, "contenteditable");
	expect(isContentEditable(tree, inner)).toBe(false);
	expect(isContentEditable(tree, text)).toBe(false);
});

it("retains keyboard editing, rendering and validation for nested HTML controls", () => {
	const { tree, add } = fixture();
	const foreign = add("foreignObject", {}, tree.root, svgNamespace);
	const wrapper = add(
		"textarea",
		{ disabled: "", readonly: "" },
		foreign,
		svgNamespace,
	);
	const textarea = add("textarea", { required: "", minlength: "2" }, wrapper);
	tree.append(textarea, tree.createText("base"));
	const actions = new DocumentInteractions(tree);
	expect(focusTabIndex(tree, textarea)).toBe(0);
	expect(textareaDefaultValue(tree, textarea)).toBe("base");
	expect(isValidationCandidate(tree, textarea)).toBe(true);
	expect(controlValidity(tree, textarea).valid).toBe(true);
	expect(describeControl(tree, textarea, 16)).toMatchObject({
		kind: "textarea",
		text: "base",
	});
	actions.focus.focus(tree.reference(textarea));
	expect(actions.keyboard.type("!").characters).toBe(1);
	expect(controlValue(tree, textarea)).toBe("base!");
	expect(readNativeControlSelection(tree, textarea)).toMatchObject({
		start: 5,
		end: 5,
	});
	actions.fill(tree.reference(textarea), "");
	expect(controlValidity(tree, textarea).valueMissing).toBe(true);
	expect(validationMessage(tree, textarea)).not.toBe("");
});

it("does not dispatch HTML keyboard defaults for a foreign active target", () => {
	const { tree, add } = fixture();
	const actions = new DocumentInteractions(tree);
	const active = vi.spyOn(actions.focus, "active");
	const activate = vi.spyOn(tree, "setKeyboardActivation");
	const defaults = vi.fn();
	for (const type of ["click", "beforeinput", "input", "change"])
		actions.events.addEventListener(tree.root, type, defaults, {
			capture: true,
		});
	for (const tagName of ["textarea", "select", "button", "input"]) {
		const foreign = add(
			tagName,
			{ type: "checkbox", tabindex: "0" },
			tree.root,
			svgNamespace,
		);
		tree.setActiveElement(foreign);
		active.mockReturnValue(foreign);
		for (const key of ["Enter", "Space", "x", "Backspace", "ArrowDown"]) {
			expect(actions.keyboard.press(key).defaultAction).toBeUndefined();
			expect(tree.get(foreign).control).toEqual({});
		}
	}
	expect(defaults).not.toHaveBeenCalled();
	expect(activate.mock.calls.every(([target]) => target === null)).toBe(true);
	expect(tree.keyboardActiveElement).toBeNull();
	expect(actions.events.drainErrors()).toEqual([]);
});

it.each([svgNamespace, mathmlNamespace])(
	"rejects foreign control writes without resource, mutation or cache side effects in %s",
	(namespaceURI) => {
		const { tree, add } = fixture();
		const input = add("input", { type: "checkbox" }, tree.root, namespaceURI);
		const textarea = add("textarea", {}, tree.root, namespaceURI);
		const select = add("select", {}, tree.root, namespaceURI);
		const option = add("option", {}, select, namespaceURI);
		const form = add("form", {}, tree.root, namespaceURI);
		const label = add("label", {}, tree.root, namespaceURI);
		const inputRef = tree.reference(input);
		const textareaRef = tree.reference(textarea);
		const selectRef = tree.reference(select);
		const nodes = [input, textarea, select, option, form, label].map((id) =>
			tree.get(id),
		);
		const revision = tree.revision;
		const formRevision = tree.formAssociationRevision;
		const resources = tree.resourceUsage();
		const toggles = tree.detailsToggleTasks.metrics();
		const onClose = vi.spyOn(tree, "onClose");
		for (const operation of [
			() => fillTextControl(tree, inputRef, "value"),
			() => fillTextControl(tree, textareaRef, "value"),
			() => setControlChecked(tree, inputRef, true),
			() => setControlCheckedState(tree, input, true),
			() => radioGroup(tree, input),
			() => selectControlValues(tree, selectRef, []),
			() => formControls(tree, form),
			() => labelControl(tree, label),
			() => tree.setInputChecked(input, true),
			() => tree.setOptionSelected(option, true),
			() => tree.setSelectSelection(select, [], true),
			() => tree.setControl(input, { value: "value", checked: true }),
			() => tree.setControl(option, { selected: true }),
			() => tree.clearControl(input, ["value", "checked"]),
			() => tree.clearControl(option, ["selected"]),
		]) {
			expect(operation).toThrow();
			expect(tree.revision).toBe(revision);
			expect(tree.formAssociationRevision).toBe(formRevision);
			expect(tree.resourceUsage()).toEqual(resources);
			expect(tree.detailsToggleTasks.metrics()).toEqual(toggles);
			for (const node of nodes) expect(tree.get(node.id)).toBe(node);
		}
		expect(onClose).not.toHaveBeenCalled();
	},
);
