import { afterEach, expect, it, vi } from "vitest";
import { type WaitingAction, runWhenActionable } from "./action-wait.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
function fixture() {
	vi.useFakeTimers();
	const document = new DocumentTree("https://example.com/");
	documents.push(document);
	const interactions = new DocumentInteractions(document);
	const queries = new DocumentQueries(document);
	const page = { document, interactions, queries };
	const controller = new AbortController();
	const add = (
		tag = "button",
		attributes: Record<string, string> = { id: "target" },
		parent = document.root,
	) => {
		const id = document.createElement(tag, attributes);
		document.append(parent, id);
		return id;
	};
	const perform = vi.fn(async (_page, reference: string) => reference);
	const run = (
		target = "#target",
		action: WaitingAction = { kind: "click" },
		options = { intervalMs: 5, maxPolls: 20 },
	) =>
		runWhenActionable(
			() => page,
			target,
			action,
			controller.signal,
			perform,
			options,
		);
	return {
		page,
		controller,
		add,
		perform,
		run,
		document,
		interactions,
		queries,
	};
}

afterEach(() => {
	for (const document of documents.splice(0)) document.close();
	vi.useRealTimers();
});

it("starts a ready action immediately with no polling timer", async () => {
	const test = fixture();
	const node = test.add();
	expect(await test.run()).toBe(test.document.reference(node));
	expect(test.perform).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});

it("waits for selector attachment and invokes the action once", async () => {
	const test = fixture();
	const waiting = test.run();
	expect(test.perform).not.toHaveBeenCalled();
	const node = test.add();
	await vi.advanceTimersByTimeAsync(5);
	expect(await waiting).toBe(test.document.reference(node));
	expect(test.perform).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});

it("waits for visibility, enabled state and editability without dispatching or changing focus", async () => {
	const test = fixture();
	const node = test.add("input", {
		id: "target",
		hidden: "",
		disabled: "",
		readonly: "",
	});
	const callback = vi.fn();
	test.interactions.events.addEventListener(node, "focus", callback);
	const waiting = test.run("#target", { kind: "fill", value: "value" });
	for (const attribute of ["hidden", "disabled"]) {
		test.document.removeAttribute(node, attribute);
		await vi.advanceTimersByTimeAsync(5);
		expect(test.perform).not.toHaveBeenCalled();
	}
	expect(callback).not.toHaveBeenCalled();
	expect(test.document.activeElement).toBeNull();
	expect(test.document.get(node).control.value).toBeUndefined();
	test.document.removeAttribute(node, "readonly");
	await vi.advanceTimersByTimeAsync(5);
	await waiting;
	expect(test.perform).toHaveBeenCalledTimes(1);
});

it("avoids repeating expensive resolution while the document revision is unchanged", async () => {
	const test = fixture();
	const query = vi.spyOn(test.queries, "querySelectorAll");
	const waiting = test.run();
	void waiting.catch(() => undefined);
	await vi.advanceTimersByTimeAsync(15);
	expect(query).toHaveBeenCalledTimes(1);
	test.controller.abort(new AgentBrowserError("timeout", "test deadline"));
	await expect(waiting).rejects.toMatchObject({ code: "timeout" });
	expect(test.perform).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("prepares selection without mutating options and waits for an enabled requested option", async () => {
	const test = fixture();
	const select = test.add("select");
	const waiting = test.run("#target", { kind: "select", values: ["late"] });
	const option = test.add("option", { value: "late", disabled: "" }, select);
	const initialControl = test.document.get(option).control;
	const initialRevision = test.document.revision;
	await vi.advanceTimersByTimeAsync(5);
	expect(test.perform).not.toHaveBeenCalled();
	expect(test.document.get(option).control).toEqual(initialControl);
	expect(test.document.revision).toBe(initialRevision);
	test.document.removeAttribute(option, "disabled");
	await vi.advanceTimersByTimeAsync(5);
	await waiting;
	expect(test.perform).toHaveBeenCalledTimes(1);
	expect(test.document.get(option).control).toEqual(initialControl);
});

it("does not wait or pick a first element for ambiguous targets", async () => {
	const test = fixture();
	test.add();
	test.add();
	await expect(test.run()).rejects.toMatchObject({ code: "not-actionable" });
	expect(test.perform).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("rejects invalid syntax and permanent control/value errors without waiting", async () => {
	const test = fixture();
	const node = test.add("input", {
		id: "target",
		type: "checkbox",
		readonly: "",
	});
	await expect(test.run("getByRole('button').first()")).rejects.toMatchObject({
		code: "unsupported",
	});
	await expect(
		test.run("#target", { kind: "fill", value: "invalid" }),
	).rejects.toMatchObject({ code: "not-actionable" });
	test.document.setAttribute(node, "type", "number");
	test.document.removeAttribute(node, "readonly");
	await expect(
		test.run("#target", { kind: "fill", value: "not a number" }),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(vi.getTimerCount()).toBe(0);
});

it("re-resolves selectors against a replacement document but never rebinds a stale ref", async () => {
	const first = fixture();
	const second = fixture();
	let current = first.page;
	const waiting = runWhenActionable(
		() => current,
		"#target",
		{ kind: "click" },
		first.controller.signal,
		first.perform,
		{ intervalMs: 5 },
	);
	const replacement = second.add();
	current = second.page;
	first.document.close();
	await vi.advanceTimersByTimeAsync(5);
	expect(await waiting).toBe(second.document.reference(replacement));
	const saved = second.document.reference(replacement);
	second.document.remove(replacement);
	await expect(second.run(saved)).rejects.toMatchObject({
		code: "stale-reference",
	});
});

it("never retries after the action callback starts, even for a not-found error", async () => {
	const test = fixture();
	test.add();
	test.perform.mockImplementation(async () => {
		throw new AgentBrowserError("not-found", "removed during action");
	});
	await expect(test.run()).rejects.toMatchObject({ code: "not-found" });
	await vi.advanceTimersByTimeAsync(50);
	expect(test.perform).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});

it("waits for an existing event dispatch to settle before entering a new action", async () => {
	const test = fixture();
	const node = test.add();
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.interactions.events.addEventListener(
		node,
		"held",
		controlledEventListener(() => prefix),
	);
	const dispatch = test.interactions.events.dispatchEventAsync(
		node,
		new BrowserEvent("held"),
	);
	const waiting = test.run();
	expect(test.perform).not.toHaveBeenCalled();
	release();
	await dispatch;
	await waiting;
	expect(test.perform).toHaveBeenCalledTimes(1);
});

it("aborts an event-idle wait without starting the action", async () => {
	const test = fixture();
	const node = test.add();
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.interactions.events.addEventListener(
		node,
		"held",
		controlledEventListener(() => prefix),
	);
	const dispatch = test.interactions.events.dispatchEventAsync(
		node,
		new BrowserEvent("held"),
	);
	const waiting = test.run();
	test.controller.abort(new AgentBrowserError("closed", "owner closed"));
	await expect(waiting).rejects.toMatchObject({ code: "closed" });
	release();
	await dispatch;
	expect(test.perform).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("bounds polling independently of repeated DOM changes", async () => {
	const test = fixture();
	const waiting = test.run(
		"#target",
		{ kind: "click" },
		{ intervalMs: 1, maxPolls: 3 },
	);
	void waiting.catch(() => undefined);
	await vi.advanceTimersByTimeAsync(3);
	await expect(waiting).rejects.toMatchObject({ code: "resource-limit" });
	expect(vi.getTimerCount()).toBe(0);
});

it("detects closed native owners even when their revision has not changed", async () => {
	const test = fixture();
	const waiting = test.run();
	void waiting.catch(() => undefined);
	test.document.close();
	await vi.advanceTimersByTimeAsync(5);
	await expect(waiting).rejects.toMatchObject({ code: "closed" });
	expect(test.perform).not.toHaveBeenCalled();
});
