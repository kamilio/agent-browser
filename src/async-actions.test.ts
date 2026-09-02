import { expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";

function fixture() {
	const tree = new DocumentTree("https://example.com/");
	const actions = new DocumentInteractions(tree);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = tree.root,
	) => {
		const target = tree.createElement(tag, attributes);
		tree.append(parent, target);
		return target;
	};
	const form = add("form", { action: "/submit" });
	const input = add("input", { name: "field", value: "default" }, form);
	const checkbox = add("input", { type: "checkbox" }, form);
	return {
		tree,
		actions,
		events: actions.events,
		forms: actions.forms,
		form,
		input,
		checkbox,
		add,
	};
}

function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

it("waits for a controlled reset prefix before resetting current controls", async () => {
	const { tree, forms, events, form, input } = fixture();
	const waiting = gate();
	tree.setControl(input, { value: "edited" });
	events.addEventListener(
		form,
		"reset",
		controlledEventListener(async () => {
			await waiting.pending;
			tree.setAttribute(input, "value", "new default");
		}),
	);
	const reset = forms.resetAsync(tree.reference(form));
	expect(controlValue(tree, input)).toBe("edited");
	waiting.release();
	expect(await reset).toMatchObject({ reset: true, canceled: false });
	expect(controlValue(tree, input)).toBe("new default");
	tree.close();
});

it("honors controlled reset cancellation and releases its recursion guard", async () => {
	const { tree, forms, events, form, input } = fixture();
	tree.setControl(input, { value: "edited" });
	events.addEventListener(
		form,
		"reset",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			event.preventDefault();
		}),
		{ once: true },
	);
	expect(await forms.resetAsync(tree.reference(form))).toMatchObject({
		reset: false,
		canceled: true,
	});
	expect(controlValue(tree, input)).toBe("edited");
	expect(await forms.resetAsync(tree.reference(form))).toMatchObject({
		reset: true,
		recursive: false,
	});
	tree.close();
});

it("serializes submit-listener changes only after its controlled prefix", async () => {
	const { tree, forms, events, form, input } = fixture();
	const waiting = gate();
	events.addEventListener(
		form,
		"submit",
		controlledEventListener(async () => {
			await waiting.pending;
			tree.setControl(input, { value: "from script" });
			tree.setAttribute(form, "action", "/changed");
		}),
	);
	const submitted = forms.requestSubmitAsync(tree.reference(form));
	waiting.release();
	expect((await submitted).submission?.request.url).toBe(
		"https://example.com/changed?field=from+script",
	);
	tree.close();
});

it("awaits invalid listeners but does not turn a repaired invalid submission into a valid one", async () => {
	const { tree, forms, events, form, input } = fixture();
	tree.setAttribute(input, "required", "");
	tree.setControl(input, { value: "" });
	events.addEventListener(
		input,
		"invalid",
		controlledEventListener(async () => {
			await Promise.resolve();
			tree.setControl(input, { value: "repaired" });
		}),
	);
	const submitted = await forms.requestSubmitAsync(tree.reference(form));
	expect(submitted.invalid).toHaveLength(1);
	expect(submitted.submission).toBeUndefined();
	expect(
		(await forms.requestSubmitAsync(tree.reference(form))).submission,
	).toBeDefined();
	tree.close();
});

it("preserves change/blur/focus ordering across controlled phases", async () => {
	const { tree, actions, events, input, checkbox } = fixture();
	await actions.fillAsync(tree.reference(input), "edited");
	const trace: string[] = [];
	for (const [target, names] of [
		[input, ["change", "blur", "focusout"]],
		[checkbox, ["focus", "focusin"]],
	] as const)
		for (const name of names)
			events.addEventListener(
				target,
				name,
				controlledEventListener(async () => {
					await Promise.resolve();
					trace.push(name);
				}),
			);
	await actions.focus.focusAsync(tree.reference(checkbox));
	expect(trace).toEqual(["change", "blur", "focusout", "focus", "focusin"]);
	tree.close();
});

it("does not apply a fill after controlled beforeinput cancellation", async () => {
	const { tree, actions, events, input } = fixture();
	events.addEventListener(
		input,
		"beforeinput",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			event.preventDefault();
		}),
	);
	expect(
		await actions.fillAsync(tree.reference(input), "blocked"),
	).toMatchObject({ defaultPrevented: true });
	expect(controlValue(tree, input)).toBe("default");
	tree.close();
});

it("rolls checkbox preactivation back after a controlled click cancellation", async () => {
	const { tree, actions, events, checkbox } = fixture();
	let sawChecked = false;
	events.addEventListener(
		checkbox,
		"click",
		controlledEventListener(async (_target, event) => {
			sawChecked = controlChecked(tree, checkbox);
			await Promise.resolve();
			event.preventDefault();
		}),
	);
	expect(await actions.clickAsync(tree.reference(checkbox))).toMatchObject({
		defaultPrevented: true,
	});
	expect(sawChecked).toBe(true);
	expect(controlChecked(tree, checkbox)).toBe(false);
	tree.close();
});

it("rolls preactivation back and runs no input/change after fatal event shutdown", async () => {
	const { tree, actions, events, checkbox } = fixture();
	let changed = false;
	events.addEventListener(
		checkbox,
		"click",
		controlledEventListener(async () => {
			events.close();
		}),
	);
	events.addEventListener(checkbox, "input", () => {
		changed = true;
	});
	await expect(
		actions.clickAsync(tree.reference(checkbox)),
	).rejects.toMatchObject({ code: "closed" });
	expect(controlChecked(tree, checkbox)).toBe(false);
	expect(changed).toBe(false);
	tree.close();
});

it("runs controlled click and reset handlers before reset-button defaults", async () => {
	const { tree, actions, events, form, input, add } = fixture();
	const reset = add("button", { type: "reset" }, form);
	tree.setControl(input, { value: "edited" });
	const trace: string[] = [];
	for (const [target, name] of [
		[reset, "click"],
		[form, "reset"],
	] as const)
		events.addEventListener(
			target,
			name,
			controlledEventListener(async () => {
				await Promise.resolve();
				trace.push(name);
			}),
		);
	expect((await actions.clickAsync(tree.reference(reset))).reset?.reset).toBe(
		true,
	);
	expect(trace).toEqual(["click", "reset"]);
	expect(controlValue(tree, input)).toBe("default");
	tree.close();
});

it("forwards a label activation through controlled control listeners", async () => {
	const { tree, actions, events, checkbox, add } = fixture();
	tree.setAttribute(checkbox, "id", "check");
	const label = add("label", { for: "check" });
	events.addEventListener(
		checkbox,
		"click",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			event.preventDefault();
		}),
	);
	const result = await actions.clickAsync(tree.reference(label));
	expect(result.label).toMatchObject({
		forwarded: true,
		controlDefaultPrevented: true,
	});
	expect(controlChecked(tree, checkbox)).toBe(false);
	tree.close();
});

it("types through controlled beforeinput listeners and still sends keyup for a canceled character", async () => {
	const { tree, actions, events, input } = fixture();
	actions.fill(tree.reference(input), "");
	let edits = 0;
	let keyups = 0;
	events.addEventListener(
		input,
		"beforeinput",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			if (++edits === 1) event.preventDefault();
		}),
	);
	events.addEventListener(
		input,
		"keyup",
		controlledEventListener(async () => {
			await Promise.resolve();
			keyups++;
		}),
	);
	expect(await actions.keyboard.typeAsync("ab")).toMatchObject({
		canceled: true,
		characters: 2,
	});
	expect(controlValue(tree, input)).toBe("b");
	expect(keyups).toBe(2);
	tree.close();
});

it("routes Space activation through controlled keyup and click listeners", async () => {
	const { tree, actions, events, checkbox } = fixture();
	actions.focus.focus(tree.reference(checkbox));
	const trace: string[] = [];
	events.addEventListener(
		checkbox,
		"keyup",
		controlledEventListener(async () => {
			await Promise.resolve();
			trace.push("keyup");
		}),
	);
	events.addEventListener(
		checkbox,
		"click",
		controlledEventListener(async (_target, event) => {
			await Promise.resolve();
			trace.push("click");
			event.preventDefault();
		}),
	);
	const result = await actions.keyboard.pressAsync("Space");
	expect(result.interaction?.defaultPrevented).toBe(true);
	expect(trace).toEqual(["keyup", "click"]);
	expect(controlChecked(tree, checkbox)).toBe(false);
	tree.close();
});

it("awaits controlled focus transitions during Tab", async () => {
	const { tree, actions, events, input, checkbox } = fixture();
	actions.focus.focus(tree.reference(input));
	let focused = false;
	events.addEventListener(
		checkbox,
		"focus",
		controlledEventListener(async () => {
			await Promise.resolve();
			focused = true;
		}),
	);
	await actions.keyboard.pressAsync("Tab");
	expect(actions.focus.active()).toBe(checkbox);
	expect(focused).toBe(true);
	tree.close();
});

it("runs controlled keyup cleanup when a keydown phase invalidates the editable target", async () => {
	const { tree, actions, events, input } = fixture();
	actions.focus.focus(tree.reference(input));
	let keyups = 0;
	events.addEventListener(
		input,
		"keydown",
		controlledEventListener(async () => {
			tree.setAttribute(input, "readonly", "");
		}),
	);
	events.addEventListener(
		input,
		"keyup",
		controlledEventListener(async () => {
			await Promise.resolve();
			keyups++;
		}),
	);
	await expect(actions.keyboard.pressAsync("x")).rejects.toMatchObject({
		code: "not-actionable",
	});
	expect(keyups).toBe(1);
	expect(controlValue(tree, input)).toBe("default");
	tree.close();
});
