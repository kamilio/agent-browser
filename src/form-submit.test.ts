import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserSubmitEvent } from "./form-actions.js";
import { DocumentInteractions } from "./interactions.js";

const nonemptyValues: Record<string, string> = {
	date: "2024-01-01",
	month: "2024-01",
	week: "2024-W01",
	time: "12:00",
	"datetime-local": "2024-01-01T12:00",
};

function fixture() {
	const tree = new DocumentTree("https://example.com/start");
	const actions = new DocumentInteractions(tree);
	const form = tree.createElement("form", {
		id: "form",
		method: "post",
		action: "/echo",
	});
	tree.append(tree.root, form);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = form,
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		return id;
	};
	const submit = (submitter?: number) =>
		actions.forms.requestSubmit(tree.reference(form), {
			submitter:
				submitter === undefined ? undefined : tree.reference(submitter),
		});
	return { tree, form, add, submit, actions, events: actions.events };
}

it("fires a bubbling cancelable submit event with the actual submitter before serializing", () => {
	const { tree, form, add, submit, events } = fixture();
	const field = add("input", { name: "name", value: "before" });
	const button = add("button", { name: "action", value: "send" });
	const calls: unknown[] = [];
	events.addEventListener(form, "submit", (event) => {
		expect(event).toBeInstanceOf(BrowserSubmitEvent);
		calls.push([
			(event as BrowserSubmitEvent).submitter,
			event.bubbles,
			event.cancelable,
			event.composed,
		]);
		tree.setControl(field, { value: "after" });
		tree.setAttribute(form, "action", "/changed");
	});
	events.addEventListener(tree.root, "submit", () => calls.push("root"));
	const result = submit(button);
	expect(calls).toEqual([[button, true, true, false], "root"]);
	expect(result.submission?.request.url).toBe("https://example.com/changed");
	expect(
		new TextDecoder().decode(result.submission?.request.body as Uint8Array),
	).toBe("name=after&action=send");
});

it("canceling submit prevents serialization and recursive submit is a no-op", () => {
	const { form, submit, events } = fixture();
	let recursive: ReturnType<typeof submit> | undefined;
	events.addEventListener(form, "submit", (event) => {
		recursive = submit();
		event.preventDefault();
	});
	const result = submit();
	expect(result.canceled).toBe(true);
	expect(result.submission).toBeUndefined();
	expect(recursive?.recursive).toBe(true);
	expect(recursive?.submission).toBeUndefined();
});

it("required validation precedes submit and invalid cancellation does not authorize submission", () => {
	const { tree, add, submit, events } = fixture();
	const field = add("input", { required: "", name: "value" });
	let submits = 0;
	events.addEventListener(tree.root, "submit", () => submits++);
	events.addEventListener(field, "invalid", (event) => {
		expect(event.bubbles).toBe(false);
		event.preventDefault();
		tree.setControl(field, { value: "now filled" });
	});
	const result = submit();
	expect(result).toMatchObject({
		invalid: [{ reference: tree.reference(field), reason: "value-missing" }],
	});
	expect(result.submission).toBeUndefined();
	expect(submits).toBe(0);
	expect(submit().submission).toBeDefined();
	expect(submits).toBe(1);
});

it("ignores disabled, read-only and datalist descendants during validation", () => {
	const { add, submit } = fixture();
	add("input", { required: "", disabled: "" });
	add("textarea", { required: "", readonly: "" });
	add("input", { required: "", type: "hidden" });
	add("input", { required: "" }, add("datalist"));
	expect(submit().invalid).toEqual([]);
});

it("validates checkboxes and radio groups, including unnamed controls", () => {
	const { tree, add, submit } = fixture();
	const check = add("input", { type: "checkbox", required: "" });
	const first = add("input", { type: "radio", name: "group", required: "" });
	const second = add("input", { type: "radio", name: "group" });
	expect(submit().invalid.map((entry) => entry.reference)).toEqual(
		[check, first, second].map((id) => tree.reference(id)),
	);
	tree.setControl(check, { checked: true });
	tree.setControl(second, { checked: true });
	expect(submit().invalid).toEqual([]);
});

it("distinguishes select placeholders from other empty-valued options", () => {
	const { tree, add, submit } = fixture();
	const select = add("select", { required: "" });
	const placeholder = add("option", { value: "" }, select);
	const other = add("option", { value: "" }, select);
	expect(submit().invalid).toHaveLength(1);
	tree.setControl(placeholder, { selected: false });
	tree.setControl(other, { selected: true });
	expect(submit().invalid).toEqual([]);
});

it("validates absolute URL inputs without restricting their submission data scheme", () => {
	const { tree, add, submit } = fixture();
	const field = add("input", { type: "url", value: "relative/path" });
	expect(submit().invalid[0].reason).toBe("type-mismatch");
	tree.setControl(field, { value: "mailto:test@example.com" });
	expect(submit().invalid).toEqual([]);
});

it.each(["pattern", "min", "max", "step"])(
	"fails explicitly for unsupported %s instead of bypassing validation",
	(attribute) => {
		const { add, submit } = fixture();
		add("input", { [attribute]: "1" });
		expect(() => submit()).toThrow(/not implemented/);
	},
);

it.each(["date", "range", "color"])(
	"does not invent validity for %s inputs",
	(type) => {
		const { add, submit } = fixture();
		add("input", { type, value: nonemptyValues[type] ?? "nonempty" });
		expect(() => submit()).toThrow(/not implemented/);
	},
);

it.each(["date", "month", "week", "time", "datetime-local"])(
	"validates empty %s controls without claiming nonempty type support",
	(type) => {
		const { tree, add, submit } = fixture();
		const field = add("input", {
			type,
			name: "optional",
			min: "11:00",
			max: "21:00",
			step: "900",
		});
		expect(submit().invalid).toEqual([]);
		tree.setAttribute(field, "required", "");
		expect(submit().invalid).toEqual([
			{ reference: tree.reference(field), reason: "value-missing" },
		]);
		tree.setControl(field, { value: nonemptyValues[type] ?? "nonempty" });
		expect(() => submit()).toThrow("not implemented");
	},
);

it("honors form and submitter validation bypass, including submitter overrides", () => {
	const { tree, form, add, submit } = fixture();
	add("input", { required: "", pattern: "(a+)+$" });
	const button = add("button", {
		formnovalidate: "",
		formaction: "/override",
		formmethod: "get",
	});
	expect(submit(button).submission?.request).toMatchObject({
		method: "GET",
		url: "https://example.com/override",
	});
	tree.setAttribute(form, "novalidate", "");
	expect(submit().submission).toBeDefined();
});

it("rejects stale or reassigned submitters after listeners and leaves the guard reusable", () => {
	const { tree, form, add, submit, events } = fixture();
	const button = add("button");
	events.addEventListener(form, "submit", () => tree.remove(button), {
		once: true,
	});
	expect(() => submit(button)).toThrow();
	expect(submit().submission).toBeDefined();
});

it("required uploads use explicit library-owned file state", () => {
	const { tree, form, add, submit, actions } = fixture();
	const file = add("input", { type: "file", name: "upload", required: "" });
	expect(submit().invalid).toHaveLength(1);
	expect(
		actions.forms.requestSubmit(tree.reference(form), {
			files: new Map([
				[file, [{ name: "fixture.txt", data: new Uint8Array() }]],
			]),
		}).invalid,
	).toEqual([]);
});

it("bounded serialization errors preserve listener mutations but release the submission guard", () => {
	const { tree, form, add, actions, events } = fixture();
	const field = add("input", { name: "value" });
	events.addEventListener(form, "submit", () =>
		tree.setControl(field, { value: "longer than the limit" }),
	);
	expect(() =>
		actions.forms.requestSubmit(tree.reference(form), { maxBytes: 1 }),
	).toThrow(/limit/);
	expect(tree.get(field).control.value).toBe("longer than the limit");
	expect(
		actions.forms.requestSubmit(tree.reference(form)).submission,
	).toBeDefined();
});

it("closed documents and malformed upload state cannot dispatch submission events", () => {
	const { tree, form, actions, events } = fixture();
	const reference = tree.reference(form);
	let submits = 0;
	events.addEventListener(form, "submit", () => submits++);
	expect(() =>
		actions.forms.requestSubmit(reference, { files: {} as Map<number, []> }),
	).toThrow(/Invalid form options/);
	tree.close();
	expect(() => actions.forms.requestSubmit(reference)).toThrow(/closed/);
	expect(submits).toBe(0);
});
