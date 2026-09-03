import { afterEach, expect, it } from "vitest";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { validEmailValue } from "./input-email.js";
import { sanitizeInputValue } from "./input-values.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(value = "", attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const form = tree.createElement("form");
	const input = tree.createElement("input", {
		type: "email",
		name: "mail",
		value,
		...attributes,
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	const events = new DocumentEvents(tree);
	const forms = new DocumentForms(tree, events);
	return {
		tree,
		form,
		input,
		events,
		forms,
		submit: () => forms.requestSubmit(tree.reference(form)),
	};
}

it.each(["user@example.test", "user@localhost"])(
	"submits a valid native email %s",
	(value) => {
		const { submit } = fixture(value);
		const result = submit();
		expect(result.invalid).toEqual([]);
		expect(result.submission).toBeDefined();
	},
);

it.each(["not-an-address", "user@", "user@-host"])(
	"reports type mismatch instead of unsupported for %s",
	(value) => {
		const { tree, input, submit } = fixture(value);
		expect(submit().invalid).toEqual([
			{ reference: tree.reference(input), reason: "type-mismatch" },
		]);
	},
);

it("submits multiple addresses after trimming each token", () => {
	const { submit } = fixture(" first@host ,\tsecond@host ", { multiple: "" });
	const result = submit();
	expect(result.invalid).toEqual([]);
	expect(
		new URL(result.submission?.request.url ?? "").searchParams.get("mail"),
	).toBe("first@host,second@host");
});

it("retains interior newlines in multiple-address values for validation", () => {
	expect(
		sanitizeInputValue("email", "first\n@host,second@host", { multiple: "" }),
	).toBe("first\n@host,second@host");
});

it("does not resurrect spaces after removing multiple", () => {
	const { tree, input } = fixture("first@host , second@host");
	tree.setAttribute(input, "multiple", "");
	expect(controlValue(tree, input)).toBe("first@host,second@host");
	tree.removeAttribute(input, "multiple");
	expect(controlValue(tree, input)).toBe("first@host,second@host");
});

it.each([
	"first.last+tag@example.test",
	".!#$%&'*+/=?^_`{|}~-@host",
	"..@host",
	"user@123",
	"User@Mixed-Case.Host",
	"user@xn--bcher-kva.test",
	`user@${"a".repeat(63)}`,
	`${"x".repeat(300)}@host`,
	`user@${Array(10).fill("a".repeat(63)).join(".")}`,
])(
	"accepts the HTML email syntax without extra mail-server restrictions: %s",
	(value) => {
		expect(validEmailValue(value, false)).toBe(true);
		expect(fixture(value).submit().invalid).toEqual([]);
	},
);

it.each([
	"@host",
	"user@@host",
	"user@host-",
	"user@host..test",
	"user@.host",
	"user@host.",
	"user@under_score",
	"user@[127.0.0.1]",
	'"user"@host',
	"user(comment)@host",
	"first last@host",
	"user@bücher.test",
	"üser@host",
	"user\u0000@host",
	"user\u00a0@host",
	`user@${"a".repeat(64)}`,
	"first@host,second@host",
])("rejects malformed single email %s", (value) => {
	expect(validEmailValue(value, false)).toBe(false);
	expect(fixture(value).submit().invalid[0]?.reason).toBe("type-mismatch");
});

it.each([
	",",
	",user@host",
	"user@host,",
	"user@host,,second@host",
	"user@host, \t",
	"first\n@host,second@host",
])("rejects empty or malformed multiple-address tokens: %s", (value) => {
	const { submit } = fixture(value, { multiple: "" });
	expect(submit().invalid[0]?.reason).toBe("type-mismatch");
	expect(submit().submission).toBeUndefined();
});

it.each([false, true])(
	"handles optional and required empty email with multiple=%s",
	(multiple) => {
		const { tree, input, submit } = fixture(
			" \t\n",
			multiple ? { multiple: "" } : {},
		);
		expect(submit().invalid).toEqual([]);
		tree.setAttribute(input, "required", "");
		expect(submit().invalid).toEqual([
			{ reference: tree.reference(input), reason: "value-missing" },
		]);
	},
);

it.each(["min", "max", "step"])(
	"ignores inapplicable email constraint %s",
	(attribute) => {
		expect(
			fixture("user@host", { [attribute]: "1" }).submit().submission,
		).toBeDefined();
	},
);

it.each(["pattern"])(
	"retains explicit unsupported email constraint %s",
	(attribute) => {
		expect(() => fixture("user@host", { [attribute]: "1" }).submit()).toThrow(
			/not implemented/,
		);
	},
);

it.each(["disabled", "readonly"])(
	"excludes %s email controls from validation",
	(attribute) => {
		expect(fixture("invalid", { [attribute]: "" }).submit().invalid).toEqual(
			[],
		);
	},
);

it("dispatches invalid before submit and does not reinterpret listener repair as success", () => {
	const { tree, form, input, events, submit } = fixture("invalid");
	const calls: string[] = [];
	events.addEventListener(input, "invalid", (event) => {
		calls.push("invalid");
		expect(event.bubbles).toBe(false);
		event.preventDefault();
		tree.setControl(input, { value: "fixed@host" });
	});
	events.addEventListener(form, "submit", () => calls.push("submit"));
	expect(submit().submission).toBeUndefined();
	expect(calls).toEqual(["invalid"]);
	expect(submit().submission).toBeDefined();
	expect(calls).toEqual(["invalid", "submit"]);
});

it("supports asynchronous native submit and explicit validation bypass", async () => {
	const { tree, form, forms, submit } = fixture("user@host");
	expect(
		(await forms.requestSubmitAsync(tree.reference(form))).submission,
	).toBeDefined();
	const invalid = tree.createElement("input", {
		type: "email",
		value: "invalid",
	});
	tree.append(form, invalid);
	expect(submit().invalid).toHaveLength(1);
	tree.setAttribute(form, "novalidate", "");
	expect(submit().submission).toBeDefined();
});

it.each([false, true])(
	"preserves dirty=%s through multiple changes, copying and reset",
	(dirty) => {
		const source = fixture("first@host , second@host");
		if (dirty)
			source.tree.setControl(source.input, {
				value: "first@host , second@host",
			});
		source.tree.setAttribute(source.input, "multiple", "");
		source.tree.removeAttribute(source.input, "multiple");
		const target = fixture();
		for (const [tree, input] of [
			[source.tree, source.input],
			[source.tree, source.tree.clone(source.input)],
			[target.tree, target.tree.copyFrom(source.tree, source.input)],
		] as const) {
			expect(controlValue(tree, input)).toBe("first@host,second@host");
			tree.setAttribute(input, "value", "new@host");
			expect(controlValue(tree, input)).toBe(
				dirty ? "first@host,second@host" : "new@host",
			);
		}
		source.forms.reset(source.tree.reference(source.form));
		expect(controlValue(source.tree, source.input)).toBe("new@host");
	},
);

it.each(["attribute", "attr-node", "attached-attr", "same-value"])(
	"shares multiple sanitization through %s mutation",
	(path) => {
		const { tree, input } = fixture("first@host , second@host");
		if (path === "attribute") tree.setAttribute(input, "multiple", "");
		else if (path === "attr-node")
			tree.setAttributeNode(input, tree.createAttribute("multiple", ""));
		else {
			tree.setAttribute(input, "multiple", "");
			tree.setControl(input, { value: "first@host , second@host" });
			if (path === "attached-attr") {
				const attribute = tree.getAttributeNode(input, "multiple");
				if (attribute === null) throw new Error("Missing multiple Attr");
				tree.setAttributeValue(attribute, "yes");
			} else tree.setAttribute(input, "multiple", "");
		}
		const attribute = tree.getAttributeNode(input, "multiple");
		if (attribute === null) throw new Error("Missing multiple Attr");
		tree.removeAttributeNode(input, attribute);
		expect(controlValue(tree, input)).toBe("first@host,second@host");
	},
);

it("integrates page value and multiple setters without repairing invalid list newlines", () => {
	const { tree, input, submit } = fixture();
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(target, name, { value: method });
			return target;
		},
	});
	const page = dom.node(input) as { value: string; multiple: boolean };
	page.multiple = true;
	page.value = "first\n@host,second@host";
	expect(page.value).toBe("first\n@host,second@host");
	expect(submit().invalid[0]?.reason).toBe("type-mismatch");
	page.multiple = false;
	expect(page.value).toBe("first@host,second@host");
	page.multiple = true;
	expect(submit().invalid).toEqual([]);
	dom.close();
});

it("preflights materialized clean state before removing multiple under a text quota", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 90 });
	documents.push(tree);
	const input = tree.createElement("input", {
		type: "email",
		multiple: "",
		value: `first@${"a".repeat(18)} , second@${"b".repeat(18)}`,
	});
	const before = tree.get(input);
	const revision = tree.revision;
	expect(() => tree.removeAttribute(input, "multiple")).toThrow(/text limit/);
	expect(tree.get(input)).toBe(before);
	expect(tree.revision).toBe(revision);
	tree.setAttribute(input, "value", "new@host");
	expect(controlValue(tree, input)).toBe("new@host");
});

it("checks all byte characters in local and domain positions against an independent grammar", () => {
	const grammar =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	for (let code = 0; code < 256; code++) {
		const character = String.fromCharCode(code);
		for (const value of [
			`${character}@host`,
			`first${character}last@host`,
			`user@${character}`,
			`user@first${character}last`,
			`user@host.${character}`,
		])
			expect(validEmailValue(value, false)).toBe(
				grammar.exec(value)?.[0] === value,
			);
	}
});

it("handles long local parts, domain chains and large lists without recursive matching", () => {
	for (const value of [
		`${"a".repeat(100_000)}@host`,
		`user@${"a.".repeat(30_000)}host`,
	]) {
		expect(validEmailValue(value, false)).toBe(true);
		expect(validEmailValue(`${value}\n`, false)).toBe(false);
	}
	const list = Array(10_000).fill("user@host").join(",");
	expect(validEmailValue(list, true)).toBe(true);
	expect(validEmailValue(`${list},`, true)).toBe(false);
});

it("trims long email whitespace edges without rescanning internal whitespace runs", () => {
	const spaces = " \t\f".repeat(40_000);
	const address = `user${spaces}@host`;
	for (const attributes of [{}, { multiple: "" }] as Record<string, string>[]) {
		expect(
			sanitizeInputValue("email", `${spaces}${address}${spaces}`, attributes),
		).toBe(address);
		expect(sanitizeInputValue("email", spaces, attributes)).toBe("");
	}
	expect(validEmailValue(address, false)).toBe(false);
});
