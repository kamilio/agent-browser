import { afterEach, expect, it } from "vitest";
import { controlValidity } from "./control-validity.js";
import { selectControlValues, setControlCheckedState } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { DocumentEvents } from "./events.js";
import { isValidationCandidate } from "./form-validation.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style>${markup}`,
		"https://fixture.invalid/selector-validity",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	return { tree, queries, id };
}

function expectState(
	queries: DocumentQueries,
	target: number,
	state: "valid" | "invalid" | "neither",
) {
	expect(queries.matches(target, ":valid")).toBe(state === "valid");
	expect(queries.matches(target, ":invalid")).toBe(state === "invalid");
}

function expectFailure(
	run: () => unknown,
	code: "unsupported" | "resource-limit",
) {
	let failure: unknown;
	try {
		run();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code });
}

it.each([
	["text", "", "filled"],
	["email", "not-an-address", "person@example.invalid"],
	["number", "3", "4"],
] as const)(
	"tracks required %s validity through live value changes",
	(type, invalid, valid) => {
		const { tree, queries, id } = fixture(
			`<input id="target" type="${type}" required ${type === "number" ? 'min="2" max="8" step="2"' : ""}>`,
		);
		const target = id("#target");
		for (const [value, expected] of [
			["", false],
			[valid, true],
			[invalid, false],
			[valid, true],
		] as const) {
			tree.setControl(target, { value });
			expect(isValidationCandidate(tree, target)).toBe(true);
			expect(controlValidity(tree, target).valid).toBe(expected);
			expectState(queries, target, expected ? "valid" : "invalid");
		}
	},
);

it("rechecks numeric range and step constraints after attribute mutations", () => {
	const { tree, queries, id } = fixture(
		'<input id="target" type="number" value="4" min="2" max="8" step="2">',
	);
	const target = id("#target");
	expectState(queries, target, "valid");
	tree.setAttribute(target, "min", "5");
	expectState(queries, target, "invalid");
	tree.setAttribute(target, "min", "2");
	tree.setAttribute(target, "max", "3");
	expectState(queries, target, "invalid");
	tree.setAttribute(target, "max", "8");
	tree.setAttribute(target, "step", "3");
	expectState(queries, target, "invalid");
	tree.setAttribute(target, "step", "any");
	expectState(queries, target, "valid");
});

it.each([
	'<input id="target" required disabled>',
	'<input id="target" required readonly>',
	'<input id="target" type="email" value="bad" readonly>',
	'<input id="target" type="number" required readonly>',
	'<textarea id="target" required readonly></textarea>',
	'<textarea id="target" required disabled></textarea>',
	'<select id="target" required disabled><option value=""></option></select>',
	'<input id="target" type="hidden" required>',
	'<input id="target" type="reset" required>',
	'<input id="target" type="button" required>',
	'<button id="target" type="reset"></button>',
	'<button id="target" type="button"></button>',
	'<datalist><input id="target" required></datalist>',
])("matches neither pseudo-class for a barred control: %s", (markup) => {
	const { tree, queries, id } = fixture(markup);
	const target = id("#target");
	tree.setCustomValidity(target, "barred custom error");
	expect(isValidationCandidate(tree, target)).toBe(false);
	expectState(queries, target, "neither");
});

it.each([
	'<button id="target" type="submit"></button>',
	'<button id="target"></button>',
	'<input id="target" type="submit">',
	'<input id="target" type="image">',
])("retains submit-button candidacy and custom errors: %s", (markup) => {
	const { tree, queries, id } = fixture(`<form id="form">${markup}</form>`);
	const target = id("#target");
	const form = id("#form");
	expect(isValidationCandidate(tree, target)).toBe(true);
	expectState(queries, target, "valid");
	tree.setCustomValidity(target, "cannot submit");
	expectState(queries, target, "invalid");
	expectState(queries, form, "invalid");
	tree.setCustomValidity(target, "");
	expectState(queries, target, "valid");
	expectState(queries, form, "valid");
});

it("tracks checkbox candidacy and checked state without treating readonly as barred", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><input id="target" type="checkbox" required readonly></form>',
	);
	const target = id("#target");
	const form = id("#form");
	expectState(queries, target, "invalid");
	setControlCheckedState(tree, target, true);
	expectState(queries, target, "valid");
	expectState(queries, form, "valid");
	setControlCheckedState(tree, target, false);
	expectState(queries, target, "invalid");
	tree.setAttribute(target, "disabled", "");
	expectState(queries, target, "neither");
	expectState(queries, form, "valid");
	tree.removeAttribute(target, "disabled");
	expectState(queries, form, "invalid");
});

it("updates radio peers across external form ownership and name changes", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><input id="required" type="radio" name="choice" required></form><input id="peer" type="radio" name="choice" form="form"><form id="other"><input id="outsider" type="radio" name="choice" checked></form>',
	);
	const required = id("#required");
	const peer = id("#peer");
	const form = id("#form");
	expectState(queries, required, "invalid");
	expectState(queries, peer, "invalid");
	setControlCheckedState(tree, peer, true);
	expectState(queries, required, "valid");
	expectState(queries, peer, "valid");
	expectState(queries, form, "valid");
	tree.setAttribute(peer, "name", "different");
	expectState(queries, required, "invalid");
	expectState(queries, peer, "valid");
	tree.setAttribute(peer, "name", "choice");
	expectState(queries, required, "valid");
	setControlCheckedState(tree, peer, false);
	expectState(queries, required, "invalid");
	expectState(queries, peer, "invalid");
	expectState(queries, form, "invalid");
});

it("tracks select selection and required textarea values", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><select id="select" required readonly><option value="">Choose</option><option value="yes">Yes</option></select><textarea id="textarea" required></textarea></form>',
	);
	const select = id("#select");
	const textarea = id("#textarea");
	const form = id("#form");
	expectState(queries, select, "invalid");
	expectState(queries, textarea, "invalid");
	selectControlValues(tree, tree.reference(select), ["yes"]);
	tree.setControl(textarea, { value: "typed" });
	expectState(queries, select, "valid");
	expectState(queries, textarea, "valid");
	expectState(queries, form, "valid");
	selectControlValues(tree, tree.reference(select), [""]);
	expectState(queries, select, "invalid");
	tree.setControl(textarea, { value: "" });
	expectState(queries, textarea, "invalid");
	expectState(queries, form, "invalid");
});

it("reveals builtin failures after clearing a custom error", () => {
	const { tree, queries, id } = fixture(
		'<input id="target" type="email" required>',
	);
	const target = id("#target");
	tree.setCustomValidity(target, "custom");
	tree.setControl(target, { value: "person@example.invalid" });
	expectState(queries, target, "invalid");
	tree.setCustomValidity(target, "");
	expectState(queries, target, "valid");
	tree.setCustomValidity(target, "custom again");
	tree.setControl(target, { value: "bad" });
	tree.setCustomValidity(target, "");
	expectState(queries, target, "invalid");
	tree.setControl(target, { value: "person@example.invalid" });
	expectState(queries, target, "valid");
});

it("distinguishes form ownership from fieldset descendants after reassociation", () => {
	const { tree, queries, id } = fixture(
		'<form id="owner" novalidate><fieldset id="group"><input id="reassigned" required form="other"></fieldset></form><form id="other"></form><input id="external" required form="owner">',
	);
	const owner = id("#owner");
	const other = id("#other");
	const group = id("#group");
	const external = id("#external");
	const reassigned = id("#reassigned");
	expectState(queries, owner, "invalid");
	expectState(queries, other, "invalid");
	expectState(queries, group, "invalid");
	tree.setControl(external, { value: "external filled" });
	expectState(queries, owner, "valid");
	expectState(queries, other, "invalid");
	expectState(queries, group, "invalid");
	tree.setAttribute(reassigned, "form", "owner");
	expectState(queries, owner, "invalid");
	expectState(queries, other, "valid");
	expectState(queries, group, "invalid");
	tree.setControl(reassigned, { value: "descendant filled" });
	tree.setControl(external, { value: "" });
	expectState(queries, owner, "invalid");
	expectState(queries, group, "valid");
	tree.setAttribute(external, "form", "other");
	expectState(queries, owner, "valid");
	expectState(queries, other, "invalid");
	tree.setAttribute(other, "id", "renamed");
	expectState(queries, other, "valid");
	tree.setAttribute(external, "form", "renamed");
	expectState(queries, other, "invalid");
});

it("makes empty aggregates valid and ignores a fieldset's own custom error", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><fieldset id="group"><input required disabled></fieldset></form>',
	);
	const form = id("#form");
	const group = id("#group");
	tree.setCustomValidity(group, "fieldset itself is barred");
	expectState(queries, form, "valid");
	expectState(queries, group, "valid");
	const child = tree.createElement("input", { required: "" });
	tree.append(group, child);
	expectState(queries, form, "invalid");
	expectState(queries, group, "invalid");
	tree.remove(child);
	expectState(queries, form, "valid");
	expectState(queries, group, "valid");
});

it("honors only the first legend exemption in a disabled fieldset", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><fieldset id="group" disabled><legend><input id="first" required></legend><input id="outside" required><legend><input id="second" required></legend></fieldset></form>',
	);
	const form = id("#form");
	const group = id("#group");
	const first = id("#first");
	const outside = id("#outside");
	const second = id("#second");
	expectState(queries, first, "invalid");
	expectState(queries, outside, "neither");
	expectState(queries, second, "neither");
	expectState(queries, group, "invalid");
	tree.setControl(first, { value: "legend filled" });
	expectState(queries, group, "valid");
	expectState(queries, form, "valid");
	tree.removeAttribute(group, "disabled");
	expectState(queries, outside, "invalid");
	expectState(queries, second, "invalid");
	expectState(queries, group, "invalid");
	tree.setAttribute(group, "disabled", "");
	expectState(queries, group, "valid");
});

it("recomputes candidacy when a control moves into and out of a datalist", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><fieldset id="group"><input id="target" required><datalist id="list"></datalist></fieldset></form>',
	);
	const target = id("#target");
	const group = id("#group");
	const form = id("#form");
	expectState(queries, target, "invalid");
	tree.append(id("#list"), target);
	expectState(queries, target, "neither");
	expectState(queries, group, "valid");
	expectState(queries, form, "valid");
	tree.append(group, target);
	expectState(queries, target, "invalid");
	expectState(queries, group, "invalid");
	expectState(queries, form, "invalid");
});

it.each(["disabled", "readonly"])(
	"refreshes text candidacy after toggling %s",
	(attribute) => {
		const { tree, queries, id } = fixture(
			'<form id="form"><input id="target" required></form>',
		);
		const target = id("#target");
		const form = id("#form");
		tree.setCustomValidity(target, "retained failure");
		expectState(queries, target, "invalid");
		tree.setAttribute(target, attribute, "");
		expectState(queries, target, "neither");
		expectState(queries, form, "valid");
		tree.removeAttribute(target, attribute);
		expectState(queries, target, "invalid");
		expectState(queries, form, "invalid");
		tree.setCustomValidity(target, "");
		tree.removeAttribute(target, "required");
		expectState(queries, target, "valid");
		expectState(queries, form, "valid");
	},
);

it("shares nested fieldset subtree checks without retaining stale descendant state", () => {
	const { tree, queries, id } = fixture(
		`<fieldset id="outer"><fieldset id="inner">${'<input value="ready">'.repeat(80)}<input id="target" value="ready"></fieldset></fieldset>`,
	);
	const outer = id("#outer");
	const inner = id("#inner");
	const target = id("#target");
	const single = "#outer:valid";
	queries.matchingSpecificities(single);
	queries.matchingSpecificities(single);
	const singleWork = queries.metrics().lastWork;
	const repeated = `fieldset${":is(:valid):not(:invalid)".repeat(12)}`;
	expect([...queries.matchingSpecificities(repeated)]).toEqual([
		[outer, [0, 24, 1]],
		[inner, [0, 24, 1]],
	]);
	expect(queries.metrics().lastWork).toBeLessThan(singleWork * 4);
	tree.setCustomValidity(target, "descendant failure");
	expect([...queries.matchingSpecificities(repeated)]).toEqual([]);
	tree.setCustomValidity(target, "");
	expect([...queries.matchingSpecificities(repeated)]).toEqual([
		[outer, [0, 24, 1]],
		[inner, [0, 24, 1]],
	]);
});

it.each([svgNamespace, mathmlNamespace])(
	"ignores non-HTML control and aggregate names in %s",
	(namespace) => {
		const { tree, queries, id } = fixture('<div id="container"></div>');
		for (const tag of [
			"input",
			"select",
			"textarea",
			"button",
			"form",
			"fieldset",
		]) {
			const target = tree.createParserElement(tag, { required: "" }, namespace);
			tree.append(id("#container"), target);
			expectState(queries, target, "neither");
		}
		expectState(queries, id("#container"), "neither");
	},
);

it.each(["valid", "invalid"])(
	"retains explicit unsupported detached state for :%s",
	(pseudo) => {
		const { tree, queries } = fixture("<main></main>");
		const detached = tree.createElement("input", { required: "" });
		expectFailure(() => queries.matches(detached, `:${pseudo}`), "unsupported");
		expect(() => queries.matches(detached, `:${pseudo}`)).toThrow("detached");
	},
);

it("composes logical and relational selectors with actual matching specificities", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><input id="empty" class="field" required><input id="filled" class="field" value="ready"><div id="plain"></div></form>',
	);
	const form = id("#form");
	const empty = id("#empty");
	const filled = id("#filled");
	expect(
		queries.querySelectorAll("input:is(:valid, :invalid):not(:valid)"),
	).toEqual([empty]);
	expect(queries.querySelectorAll("form:has(> input:invalid)")).toEqual([form]);
	expect(queries.matches(id("#plain"), ":not(:valid):not(:invalid)")).toBe(
		true,
	);
	const selector =
		"input:invalid, #empty:valid, input:is(:valid, #absent), form:has(> input:invalid)";
	expect([...queries.matchingSpecificities(selector)]).toEqual([
		[form, [0, 1, 2]],
		[empty, [0, 1, 1]],
		[filled, [1, 0, 1]],
	]);
	expect([
		...queries.matchingSpecificities(
			"input:where(:invalid), input:not(:invalid)",
		),
	]).toEqual([
		[empty, [0, 0, 1]],
		[filled, [0, 1, 1]],
	]);
	tree.setControl(empty, { value: "now filled" });
	expect(queries.querySelectorAll("form:has(> input:invalid)")).toEqual([]);
	expect([...queries.matchingSpecificities(selector)]).toEqual([
		[empty, [1, 1, 0]],
		[filled, [1, 0, 1]],
	]);
});

it.each(["input", "textarea"])(
	"refreshes validity-dependent styles after only a %s value mutation",
	(tag) => {
		const { tree, queries, id } = fixture(
			`<form id="form"><fieldset id="group"><${tag} id="target" required></${tag}><span id="result">Result</span></fieldset></form>`,
			":valid { color: green } :invalid { color: red } span { background-color: red } :is(:valid):not(:invalid) + span { background-color: green }",
		);
		const target = id("#target");
		const group = id("#group");
		const form = id("#form");
		const result = id("#result");
		const styles = documentStyles(tree);
		for (const [value, valid] of [
			["", false],
			["filled", true],
			["", false],
		] as const) {
			tree.setControl(target, { value });
			const color = valid ? [0, 128, 0, 255] : [255, 0, 0, 255];
			for (const member of [target, group, form])
				expect(styles.paint(member).color).toEqual(color);
			expect(styles.paint(result)["background-color"]).toEqual(color);
			expectState(queries, target, valid ? "valid" : "invalid");
		}
	},
);

it("keeps validity reads free of invalid events and document mutations", () => {
	const { tree, queries, id } = fixture(
		'<form id="form"><fieldset id="group"><input id="target" required></fieldset></form>',
		":invalid { color: red }",
	);
	const events = new DocumentEvents(tree);
	const seen: string[] = [];
	const members = [id("#form"), id("#group"), id("#target")];
	for (const member of members)
		events.addEventListener(member, "invalid", () => seen.push("invalid"));
	const revision = tree.revision;
	for (let repeat = 0; repeat < 3; repeat++) {
		for (const member of members) expectState(queries, member, "invalid");
		expect(queries.querySelectorAll(":invalid")).toEqual(members);
		expect([...queries.matchingSpecificities(":invalid").keys()]).toEqual(
			members,
		);
		expect(documentStyles(tree).paint(members[2]).color).toEqual([
			255, 0, 0, 255,
		]);
	}
	expect(seen).toEqual([]);
	expect(tree.revision).toBe(revision);
	expect(tree.changesSince(revision)).toMatchObject({
		reset: false,
		changes: [],
	});
});

it.each(["valid", "invalid"])(
	"propagates unsupported constraints for :%s but accepts a decisive custom error",
	(pseudo) => {
		const { tree, queries, id } = fixture(
			'<div id="plain"></div><input id="target" pattern="[a-z]+" value="abc">',
		);
		const target = id("#target");
		expectFailure(() => queries.matches(target, `:${pseudo}`), "unsupported");
		expectFailure(
			() => queries.matchingSpecificities(`#plain, #target:${pseudo}`),
			"unsupported",
		);
		tree.setCustomValidity(target, "known failure");
		expectState(queries, target, "invalid");
		tree.setCustomValidity(target, "");
		expectFailure(() => queries.matches(target, `:${pseudo}`), "unsupported");
		tree.setAttribute(target, "disabled", "");
		expectState(queries, target, "neither");
	},
);

it.each([
	["form", true],
	["form", false],
	["fieldset", true],
	["fieldset", false],
] as const)(
	"uses decisive invalid members of %s with unsupported-first=%s",
	(tag, unsupportedFirst) => {
		const unknown = '<input id="unknown" pattern="[a-z]+" value="abc">';
		const known = '<input id="known" required>';
		const { tree, queries, id } = fixture(
			`<${tag} id="aggregate">${unsupportedFirst ? unknown + known : known + unknown}</${tag}>`,
		);
		const aggregate = id("#aggregate");
		const target = id("#known");
		expectState(queries, aggregate, "invalid");
		tree.setControl(target, { value: "filled" });
		for (const pseudo of ["valid", "invalid"])
			expectFailure(
				() => queries.matches(aggregate, `:${pseudo}`),
				"unsupported",
			);
		tree.setCustomValidity(target, "decisive custom failure");
		expectState(queries, aggregate, "invalid");
		tree.setCustomValidity(target, "");
		tree.setAttribute(id("#unknown"), "disabled", "");
		expectState(queries, aggregate, "valid");
	},
);

it.each([{ maxWork: 1 }, { maxMemoEntries: 1 }, { maxIndexedNodes: 2 }])(
	"fails bounded validity maps atomically and recovers with a fresh owner: %o",
	(limits) => {
		const { tree, id } = fixture(
			`<div id="marker"></div><form id="form">${Array.from({ length: 32 }, (_, index) => `<input id="field-${index}" required>`).join("")}</form>`,
		);
		const marker = id("#marker");
		const fields = Array.from({ length: 32 }, (_, index) =>
			id(`#field-${index}`),
		);
		const selector = "#marker, input:invalid";
		const limited = new DocumentQueries(tree, limits);
		let result:
			| ReturnType<DocumentQueries["matchingSpecificities"]>
			| undefined;
		expectFailure(() => {
			result = limited.matchingSpecificities(selector);
		}, "resource-limit");
		expect(result).toBeUndefined();
		limited.close();
		const recovered = new DocumentQueries(tree);
		expect([...recovered.matchingSpecificities(selector)]).toEqual([
			[marker, [1, 0, 0]],
			...fields.map((field) => [field, [0, 1, 1]]),
		]);
		recovered.close();
	},
);

it("charges aggregate validation work beyond an ordinary indexed form lookup", () => {
	const { tree, queries, id } = fixture(
		`<form id="form">${'<input value="ready">'.repeat(80)}</form>`,
	);
	const form = id("#form");
	queries.matchingSpecificities("#form");
	queries.matchingSpecificities("#form");
	const lookupWork = queries.metrics().lastWork;
	const limited = new DocumentQueries(tree, { maxWork: lookupWork });
	expectFailure(
		() => limited.matchingSpecificities("#form:valid"),
		"resource-limit",
	);
	limited.close();
	const recovered = new DocumentQueries(tree);
	expect([...recovered.matchingSpecificities("#form:valid")]).toEqual([
		[form, [1, 1, 0]],
	]);
	expect(recovered.metrics().lastWork).toBeGreaterThan(lookupWork);
	recovered.close();
});

it("shares repeated logical aggregate checks within an operation without stale state", () => {
	const { tree, queries, id } = fixture(
		`<form id="form">${Array.from({ length: 80 }, (_, index) => `<input id="field-${index}" value="ready">`).join("")}</form>`,
	);
	const form = id("#form");
	const single = "#form:valid";
	queries.matchingSpecificities(single);
	queries.matchingSpecificities(single);
	const singleWork = queries.metrics().lastWork;
	const repeated = `#form${":is(:valid):not(:invalid)".repeat(12)}`;
	expect([...queries.matchingSpecificities(repeated)]).toEqual([
		[form, [1, 24, 0]],
	]);
	expect(queries.metrics().lastWork).toBeLessThan(singleWork * 4);
	const first = id("#field-0");
	tree.setCustomValidity(first, "new failure");
	expect([...queries.matchingSpecificities(repeated)]).toEqual([]);
	tree.setCustomValidity(first, "");
	expect([...queries.matchingSpecificities(repeated)]).toEqual([
		[form, [1, 24, 0]],
	]);
});
