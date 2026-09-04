import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions, documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Toggle extends BrowserEvent {
	readonly oldState: string;
	readonly newState: string;
	readonly source: null;
}
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(markup = "<details><summary>More</summary>Body</details>") {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(markup, "https://fixture.invalid/toggle");
	documents.push(tree);
	const details = [...tree.walk()]
		.filter(({ node }) => node.tagName === "details")
		.map(({ node }) => node.id);
	const actions = documentInteractions(tree);
	const received: Toggle[] = [];
	for (const target of details)
		actions.events.addEventListener(target, "toggle", (event) =>
			received.push(event as Toggle),
		);
	return { tree, actions, received, target: details[0], details };
}
function states(received: Toggle[]) {
	return received.map((event) => [event.oldState, event.newState]);
}

it("preserves the primary notification dispatcher when creating a secondary native action helper", async () => {
	const { tree, target, received } = fixture();
	const secondary = new DocumentInteractions(tree);
	const duplicate: Toggle[] = [];
	secondary.events.addEventListener(target, "toggle", (event) =>
		duplicate.push(event as Toggle),
	);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "open"]]);
	expect(duplicate).toEqual([]);
	secondary.close();
	tree.removeAttribute(target, "open");
	await vi.runAllTimersAsync();
	expect(received).toHaveLength(2);
});

it("rejects foreign dispatchers without disturbing the existing owner", async () => {
	const { tree, target, received } = fixture();
	const other = fixture();
	expect(() => tree.detailsToggleTasks.connect(other.actions.events)).toThrow(
		/another document/i,
	);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "open"]]);
});

it.each(["attribute", "attribute-node", "create", "clone", "import"])(
	"rejects %s queue overflow before changing attributes or allocating nodes",
	async (path) => {
		const { tree, target, received } = fixture();
		const open = tree.createElement("details", { open: "" });
		for (let index = 1; index < 512; index++)
			tree.createElement("details", { open: "" });
		const attribute = tree.createAttribute("open");
		const before = {
			nodes: tree.nodeCount,
			revision: tree.revision,
			pending: tree.detailsToggleTasks.metrics().pending,
		};
		const change = () => {
			if (path === "attribute") tree.setAttribute(target, "open", "");
			else if (path === "attribute-node")
				tree.setAttributeNode(target, attribute);
			else if (path === "create") tree.createElement("details", { open: "" });
			else if (path === "clone") tree.clone(open);
			else tree.copyFrom(tree, open);
		};
		expect(change).toThrow(/notification limit/i);
		expect({
			nodes: tree.nodeCount,
			revision: tree.revision,
			pending: tree.detailsToggleTasks.metrics().pending,
		}).toEqual(before);
		expect(tree.getAttributeRecord(attribute).ownerElement).toBeNull();
		expect(tree.get(target).attributes.open).toBeUndefined();
		await vi.runAllTimersAsync();
		tree.setAttribute(target, "open", "");
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([["closed", "open"]]);
	},
);

it("bounds lifetime task replacements without discarding the last accepted state", async () => {
	const { tree, target, received } = fixture();
	for (let index = 0; index < 4096; index++)
		tree.toggleAttribute(target, "open");
	const revision = tree.revision;
	expect(() => tree.toggleAttribute(target, "open")).toThrow(
		/notification limit/i,
	);
	expect(tree.revision).toBe(revision);
	expect(tree.get(target).attributes.open).toBeUndefined();
	expect(tree.detailsToggleTasks.metrics()).toMatchObject({
		pending: 1,
		scheduled: 4096,
		coalesced: 4095,
	});
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "closed"]]);
	expect(tree.detailsToggleTasks.metrics()).toMatchObject({
		pending: 0,
		delivered: 1,
		failed: 0,
		active: false,
	});
});

it("preflights all open descendants before cloning a subtree", () => {
	const { tree, target } = fixture();
	for (let index = 0; index < 257; index++)
		tree.append(target, tree.createElement("details", { open: "" }));
	const nodes = tree.nodeCount;
	expect(() => tree.clone(target, true)).toThrow(/notification limit/i);
	expect(tree.nodeCount).toBe(nodes);
	expect(tree.detailsToggleTasks.metrics().pending).toBe(257);
});

it("preflights template-content notification budgets without allocating a partial clone", () => {
	const { tree } = fixture();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	for (let index = 0; index < 257; index++)
		content.tree.append(
			content.id,
			content.tree.createElement("details", { open: "" }),
		);
	const nodes = [tree.nodeCount, content.tree.nodeCount];
	expect(() => tree.clone(template, true)).toThrow(/notification limit/i);
	expect([tree.nodeCount, content.tree.nodeCount]).toEqual(nodes);
});

it("keeps template cloning notifications on the template content owner", async () => {
	const { tree } = fixture();
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	const events = documentInteractions(content.tree).events;
	const original = content.tree.createElement("details", { open: "" });
	content.tree.append(content.id, original);
	const clone = tree.clone(template, true);
	const copiedContent = tree.templateContent(clone);
	const copied = copiedContent.tree.get(copiedContent.id).children[0];
	const received: Toggle[] = [];
	for (const target of [original, copied])
		events.addEventListener(target, "toggle", (event) =>
			received.push(event as Toggle),
		);
	await vi.runAllTimersAsync();
	expect(received.map((event) => event.target)).toEqual([original, copied]);
	expect(tree.detailsToggleTasks.metrics().scheduled).toBe(0);
});

it("cancels an in-flight controlled listener and all queued notifications on close", async () => {
	const { tree, actions, target, received } = fixture();
	let entered = false;
	actions.events.addEventListener(
		target,
		"toggle",
		controlledEventListener(() => {
			entered = true;
			return new Promise<void>(() => {});
		}),
	);
	tree.setAttribute(target, "open", "");
	await vi.advanceTimersByTimeAsync(1);
	expect(entered).toBe(true);
	tree.removeAttribute(target, "open");
	actions.close();
	await vi.runAllTimersAsync();
	expect(received).toHaveLength(1);
	expect(tree.detailsToggleTasks.metrics()).toMatchObject({
		pending: 0,
		active: false,
		failed: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("isolates throwing listeners without losing later tasks or retaining errors indefinitely", async () => {
	const { tree, actions, target, received } = fixture();
	actions.events.addEventListener(target, "toggle", () => {
		throw new Error("toggle listener failed");
	});
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	tree.removeAttribute(target, "open");
	await vi.runAllTimersAsync();
	expect(received).toHaveLength(2);
	expect(actions.events.drainErrors()).toHaveLength(2);
	expect(actions.events.drainErrors()).toEqual([]);
	expect(tree.detailsToggleTasks.metrics()).toMatchObject({
		delivered: 2,
		failed: 0,
		pending: 0,
	});
});

it("queues a non-bubbling non-cancelable notification after microtasks", async () => {
	const { tree, actions, target, received } = fixture();
	const phases: number[] = [];
	actions.events.addEventListener(
		tree.root,
		"toggle",
		() => phases.push(1),
		true,
	);
	actions.events.addEventListener(tree.root, "toggle", () => phases.push(3));
	tree.setAttribute(target, "open", "");
	expect(received).toEqual([]);
	await Promise.resolve();
	expect(received).toEqual([]);
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "open"]]);
	expect(phases).toEqual([1]);
	expect(received[0]).toMatchObject({
		type: "toggle",
		target,
		currentTarget: null,
		eventPhase: 0,
		bubbles: false,
		cancelable: false,
		composed: false,
		source: null,
	});
	received[0].preventDefault();
	expect(received[0].defaultPrevented).toBe(false);
});

it.each([1, 2, 3, 4, 9])(
	"coalesces %s consecutive state transitions without erasing round trips",
	async (count) => {
		const { tree, target, received } = fixture();
		for (let index = 0; index < count; index++)
			tree.toggleAttribute(target, "open");
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([
			["closed", count % 2 ? "open" : "closed"],
		]);
	},
);

it("moves a replaced task behind other queued disclosure tasks", async () => {
	const { tree, details, received } = fixture(
		"<details></details><details></details>",
	);
	tree.setAttribute(details[0], "open", "");
	tree.setAttribute(details[1], "open", "");
	tree.removeAttribute(details[0], "open");
	await vi.runAllTimersAsync();
	expect(received.map((event) => event.target)).toEqual([
		details[1],
		details[0],
	]);
	expect(states(received)).toEqual([
		["closed", "open"],
		["closed", "closed"],
	]);
});

it.each(["", "false", "OPEN"])(
	"notifies parsed initial open=%s exactly once",
	async (value) => {
		const { target, tree, received } = fixture(
			`<details open="${value}"></details>`,
		);
		tree.setAttribute(target, "open", "other");
		tree.setAttribute(target, "open", "other");
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([["closed", "open"]]);
		tree.removeAttribute(target, "open");
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([
			["closed", "open"],
			["open", "closed"],
		]);
	},
);

it("reports detached element creation and cloning without copying listeners", async () => {
	const { tree, actions, received } = fixture();
	const detached = tree.createElement("details", { open: "" });
	const copy = tree.clone(detached);
	for (const target of [detached, copy])
		actions.events.addEventListener(target, "toggle", (event) =>
			received.push(event as Toggle),
		);
	await vi.runAllTimersAsync();
	expect(received.map((event) => event.target)).toEqual([detached, copy]);
});

it("keeps imported disclosure notifications in the destination document", async () => {
	const { tree, actions, target, received } = fixture(
		"<details open></details>",
	);
	await vi.runAllTimersAsync();
	const destination = new DocumentTree("https://fixture.invalid/destination");
	documents.push(destination);
	const events = documentInteractions(destination).events;
	const copy = destination.copyFrom(tree, target);
	const imported: Toggle[] = [];
	events.addEventListener(copy, "toggle", (event) =>
		imported.push(event as Toggle),
	);
	await vi.runAllTimersAsync();
	expect(states(imported)).toEqual([["closed", "open"]]);
	expect(received).toHaveLength(1);
	expect(actions.events.drainErrors()).toEqual([]);
});

it.each(["attribute", "toggle", "attribute-node"])(
	"covers %s mutation paths and ignores value-only changes",
	async (path) => {
		const { tree, target, received } = fixture();
		if (path === "attribute") tree.setAttribute(target, "open", "false");
		else if (path === "toggle") tree.toggleAttribute(target, "open", true);
		else tree.setAttributeNode(target, tree.createAttribute("open", "false"));
		await vi.runAllTimersAsync();
		tree.setAttributeNode(target, tree.createAttribute("open", "new"));
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([["closed", "open"]]);
		const attribute = tree.getAttributeNode(target, "open");
		if (attribute === null) throw new Error("Missing open attribute");
		tree.removeAttributeNode(target, attribute);
		await vi.runAllTimersAsync();
		expect(states(received)).toEqual([
			["closed", "open"],
			["open", "closed"],
		]);
	},
);

it("uses summary activation without firing inside the click listener", async () => {
	const { tree, actions, target, received } = fixture();
	const summary = tree.get(target).children[0];
	actions.events.addEventListener(summary, "click", () =>
		expect(received).toEqual([]),
	);
	actions.click(tree.reference(summary));
	expect(received).toEqual([]);
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "open"]]);
});

it("waits for an active controlled dispatch before choosing the coalesced state", async () => {
	const { tree, actions, target, received } = fixture();
	let release = () => {};
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	actions.events.addEventListener(
		target,
		"busy",
		controlledEventListener(() => prefix),
	);
	const dispatch = actions.events.dispatchEventAsync(
		target,
		new BrowserEvent("busy"),
	);
	tree.setAttribute(target, "open", "");
	await vi.advanceTimersByTimeAsync(1);
	expect(received).toEqual([]);
	tree.removeAttribute(target, "open");
	release();
	await dispatch;
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["closed", "closed"]]);
});

it("queues listener-induced transitions as a later task and retains the running old state", async () => {
	const { tree, actions, target, received } = fixture();
	actions.events.addEventListener(
		target,
		"toggle",
		() => tree.removeAttribute(target, "open"),
		{ once: true },
	);
	tree.setAttribute(target, "open", "");
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([
		["closed", "open"],
		["closed", "closed"],
	]);
});

it.each(["document", "interactions", "dispatcher"])(
	"cancels pending work when the %s closes",
	async (owner) => {
		const { tree, actions, target, received } = fixture();
		tree.setAttribute(target, "open", "");
		if (owner === "document") tree.close();
		else if (owner === "interactions") actions.close();
		else actions.events.close();
		await vi.runAllTimersAsync();
		expect(received).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("does not replay a notification after its unobserved task has elapsed", async () => {
	vi.useFakeTimers();
	const tree = new DocumentTree("https://fixture.invalid/unobserved");
	documents.push(tree);
	const target = tree.createElement("details", { open: "" });
	await vi.runAllTimersAsync();
	const received: Toggle[] = [];
	documentInteractions(tree).events.addEventListener(
		target,
		"toggle",
		(event) => received.push(event as Toggle),
	);
	tree.removeAttribute(target, "open");
	await vi.runAllTimersAsync();
	expect(states(received)).toEqual([["open", "closed"]]);
});

it("publishes guarded toggle data and shared target identity to native script capabilities", async () => {
	const { tree, actions, target } = fixture();
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const result = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(result, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(result, name, { value: method });
			return result;
		},
	};
	let closed = false;
	const dom = new ScriptDom(tree, factory, {
		events: actions.events,
		callbacks: {
			isClosed: () => closed,
			startCallback(callback, args, options) {
				if (typeof callback !== "function")
					throw new Error("Expected callback");
				return {
					synchronous: Promise.resolve(),
					result: Promise.resolve(callback.apply(options.thisValue, args)),
				};
			},
		},
	});
	const node = dom.node(target) as {
		open: boolean;
		addEventListener(type: string, callback: (event: Toggle) => void): void;
	};
	let retained: Toggle | undefined;
	node.addEventListener("toggle", (event) => {
		retained = event;
	});
	node.open = true;
	await vi.runAllTimersAsync();
	expect(retained).toMatchObject({
		oldState: "closed",
		newState: "open",
		source: null,
		target: node,
	});
	dom.close();
	closed = true;
	expect(() => retained?.oldState).toThrow(/closed/i);
});
