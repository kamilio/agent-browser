import { afterEach, expect, it, vi } from "vitest";
import { runWhenActionable } from "./action-wait.js";
import { BrowserCommandHost } from "./command-host.js";
import { prepareControlFill } from "./control-fill.js";
import { type DocumentMutation, DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { BrowserInputEvent } from "./input-events.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const trees: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

function fixture(
	content = '<div id="editor" contenteditable><b>Old</b> text</div>',
) {
	const document = parseHtmlDocument(
		`${content}<button id="other">Other</button>`,
		"https://fixture.invalid/editable-fill",
	);
	trees.push(document);
	const queries = new DocumentQueries(document);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	const ref = (selector = "#editor") => document.reference(id(selector));
	const interactions = documentInteractions(document);
	return { document, queries, id, ref, interactions };
}

it.each(["", "true", "TRUE", "plaintext-only", "PLAINTEXT-ONLY"])(
	"fills contenteditable=%j with text, not markup",
	(attribute) => {
		const { document, interactions, ref, id } = fixture(
			`<div id="editor" contenteditable="${attribute}"><b>Old</b></div>`,
		);
		const value = '<script>alert("literal")</script> & 👩🏽‍💻';
		expect(interactions.fill(ref(), value)).toMatchObject({
			reference: ref(),
			defaultPrevented: false,
		});
		expect(document.textContent(id("#editor"))).toBe(value);
		expect(
			document
				.get(id("#editor"))
				.children.map((child) => document.get(child).kind),
		).toEqual(["text"]);
		expect(interactions.focus.active()).toBe(id("#editor"));
	},
);

it.each(["", "\n", " first\nsecond\tlast ", "\r\nline\rbreak", "same"])(
	"replaces the entire requested contents with %j",
	(value) => {
		const { document, interactions, ref, id } = fixture();
		interactions.fill(ref(), value);
		expect(document.textContent(id("#editor"))).toBe(value);
		expect(document.get(id("#editor")).children).toHaveLength(value ? 1 : 0);
	},
);

it("emits cancellable replacement input events at the editing root, not change", () => {
	const { document, interactions, ref, id } = fixture(
		'<div id="editor" contenteditable><span id="child">Old</span><b>Keep</b></div>',
	);
	const seen: unknown[] = [];
	for (const type of ["beforeinput", "input", "change"])
		interactions.events.addEventListener(document.root, type, (event) => {
			seen.push([
				event.type,
				event.target,
				event instanceof BrowserInputEvent ? event.data : null,
				event instanceof BrowserInputEvent ? event.inputType : null,
				event.bubbles,
				event.composed,
				event.cancelable,
				document.textContent(id("#editor")),
			]);
		});
	interactions.fill(ref("#child"), "New");
	expect(document.textContent(id("#editor"))).toBe("NewKeep");
	expect(interactions.focus.active()).toBe(id("#editor"));
	interactions.focus.focus(null);
	expect(seen).toEqual([
		[
			"beforeinput",
			id("#editor"),
			"New",
			"insertText",
			true,
			true,
			true,
			"OldKeep",
		],
		["input", id("#editor"), "New", "insertText", true, true, false, "NewKeep"],
	]);
});

it("publishes one combined replacement mutation and retains detached children", () => {
	const { document, interactions, ref, id } = fixture();
	const old = [...document.get(id("#editor")).children];
	const records: DocumentMutation[] = [];
	document.onMutation((record) => records.push(record));
	interactions.fill(ref(), "New");
	expect(records).toHaveLength(1);
	expect(records[0]).toMatchObject({
		type: "childList",
		target: id("#editor"),
		removedNodes: old,
		addedNodes: document.get(id("#editor")).children,
	});
	for (const child of old) expect(document.get(child).parent).toBeNull();
	expect(document.textContent(old[0])).toBe("Old");
});

it.each([false, true])(
	"honors beforeinput cancellation, asynchronous=%s",
	async (asynchronous) => {
		const { document, interactions, ref } = fixture();
		const before = serializeHtml(document);
		const input = vi.fn();
		interactions.events.addEventListener(document.root, "input", input);
		interactions.events.addEventListener(
			document.root,
			"beforeinput",
			asynchronous
				? controlledEventListener(async (_target, event) => {
						await Promise.resolve();
						event.preventDefault();
					})
				: (event) => event.preventDefault(),
		);
		const result = asynchronous
			? await interactions.fillAsync(ref(), "Rejected")
			: interactions.fill(ref(), "Rejected");
		expect(result.defaultPrevented).toBe(true);
		expect(serializeHtml(document)).toBe(before);
		expect(input).not.toHaveBeenCalled();
	},
);

it.each(["false", "inherit", "invalid", " true "])(
	"rejects noneditable root state %j without focus",
	(attribute) => {
		const { document, interactions, ref, id } = fixture();
		interactions.fill(ref(), "Supported");
		interactions.focus.focus(ref("#other"));
		document.setAttribute(id("#editor"), "contenteditable", attribute);
		expect(() => interactions.fill(ref(), "Rejected")).toThrow(
			/control|editable/,
		);
		expect(document.textContent(id("#editor"))).toBe("Supported");
		expect(interactions.focus.active()).toBe(id("#other"));
	},
);

it("inherits through invalid attributes and focuses a separate true island", () => {
	const { document, interactions, ref, id } = fixture(
		'<div id="editor" contenteditable><span id="child" contenteditable="invalid">Old</span><section contenteditable="false"><div id="island" contenteditable="true">Island</div></section></div>',
	);
	interactions.fill(ref("#child"), "Child");
	expect(interactions.focus.active()).toBe(id("#editor"));
	interactions.fill(ref("#island"), "Separate");
	expect(interactions.focus.active()).toBe(id("#island"));
	expect(document.textContent(id("#child"))).toBe("Child");
	expect(document.textContent(id("#island"))).toBe("Separate");
});

it("does not treat readonly on an editing div as a form-control restriction", () => {
	const { document, interactions, ref, id } = fixture(
		'<div id="editor" contenteditable readonly>Old</div>',
	);
	interactions.fill(ref(), "New");
	expect(document.textContent(id("#editor"))).toBe("New");
});

it.each([
	"hidden",
	"inert",
	"css",
	"detached",
	"focus",
	"editable",
	"content",
	"reparent",
])("rejects stale beforeinput target after %s mutation", (change) => {
	const { document, interactions, ref, id } = fixture();
	const target = id("#editor");
	const reference = ref();
	const input = vi.fn();
	let observed = false;
	interactions.events.addEventListener(target, "input", input);
	interactions.events.addEventListener(target, "beforeinput", () => {
		observed = true;
		if (change === "hidden" || change === "inert")
			document.setAttribute(target, change, "");
		else if (change === "css")
			document.setAttribute(target, "style", "display:none");
		else if (change === "detached") document.remove(target);
		else if (change === "focus") interactions.focus.focus(ref("#other"));
		else if (change === "editable")
			document.setAttribute(target, "contenteditable", "false");
		else if (change === "content")
			document.setTextContent(target, "Listener owns this");
		else document.insert(id("#other"), target);
	});
	expect(() => interactions.fill(reference, "Stale write")).toThrow();
	expect(observed).toBe(true);
	expect(document.textContent(target)).toBe(
		change === "content" ? "Listener owns this" : "Old text",
	);
	expect(input).not.toHaveBeenCalled();
});

it("does not discard a nested fill completed by a beforeinput listener", () => {
	const { document, interactions, ref, id } = fixture();
	interactions.events.addEventListener(
		id("#editor"),
		"beforeinput",
		() => {
			interactions.fill(ref(), "Inner wins");
		},
		{ once: true },
	);
	expect(() => interactions.fill(ref(), "Outer stale write")).toThrow(
		/changed/,
	);
	expect(document.textContent(id("#editor"))).toBe("Inner wins");
});

it("accepts focus-listener edits before the replacement begins", () => {
	const { document, interactions, ref, id } = fixture();
	interactions.events.addEventListener(id("#editor"), "focus", () => {
		document.setTextContent(id("#editor"), "Focus handler");
	});
	interactions.fill(ref(), "Requested");
	expect(document.textContent(id("#editor"))).toBe("Requested");
});

it("does not reject unrelated mutations during beforeinput", () => {
	const { document, interactions, ref, id } = fixture();
	interactions.events.addEventListener(id("#editor"), "beforeinput", () => {
		document.setTextContent(id("#other"), "Unrelated");
	});
	interactions.fill(ref(), "Requested");
	expect(document.textContent(id("#editor"))).toBe("Requested");
});

it("waits for controlled beforeinput and input phases", async () => {
	const { document, interactions, ref, id } = fixture();
	const seen: string[] = [];
	for (const type of ["beforeinput", "input"])
		interactions.events.addEventListener(
			id("#editor"),
			type,
			controlledEventListener(async () => {
				await Promise.resolve();
				seen.push(`${type}:${document.textContent(id("#editor"))}`);
			}),
		);
	await interactions.fillAsync(ref(), "New");
	expect(seen).toEqual(["beforeinput:Old text", "input:New"]);
});

it("aborts an async replacement while a controlled prefix is pending", async () => {
	const { document, interactions, ref, id } = fixture();
	expect(prepareControlFill(document, ref(), "New")).toMatchObject({
		value: "New",
	});
	let release!: () => void;
	let started!: () => void;
	const entered = new Promise<void>((resolve) => {
		started = resolve;
	});
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	interactions.events.addEventListener(
		id("#editor"),
		"beforeinput",
		controlledEventListener(() => {
			started();
			return prefix;
		}),
	);
	const controller = new AbortController();
	const pending = interactions.fillAsync(ref(), "Aborted", controller.signal);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered;
	controller.abort();
	await rejected;
	release();
	await Promise.resolve();
	expect(document.textContent(id("#editor"))).toBe("Old text");
});

it("waits for a hidden editable target before starting a command action", async () => {
	vi.useFakeTimers();
	const page = fixture('<div id="editor" contenteditable hidden>Old</div>');
	expect(prepareControlFill(page.document, page.ref(), "New")).toMatchObject({
		value: "New",
	});
	const perform = vi.fn((current, reference: string) =>
		current.interactions.fillAsync(reference, "New"),
	);
	const pending = runWhenActionable(
		() => page,
		"#editor",
		{ kind: "fill", value: "New" },
		new AbortController().signal,
		perform,
		{ intervalMs: 5, maxPolls: 10 },
	);
	expect(perform).not.toHaveBeenCalled();
	page.document.removeAttribute(page.id("#editor"), "hidden");
	await vi.advanceTimersByTimeAsync(5);
	await pending;
	expect(perform).toHaveBeenCalledTimes(1);
	expect(page.document.textContent(page.id("#editor"))).toBe("New");
});

it("preflights oversized replacement strings before focus", () => {
	const document = new DocumentTree("https://fixture.invalid/limit", {
		maxTextCodeUnits: 128,
	});
	trees.push(document);
	const editor = document.createElement("div", { contenteditable: "" });
	document.append(document.root, editor);
	const reference = document.reference(editor);
	expect(prepareControlFill(document, reference, "short")).toMatchObject({
		value: "short",
	});
	const revision = document.revision;
	expect(() =>
		documentInteractions(document).fill(reference, "x".repeat(129)),
	).toThrow(/limit/);
	expect(document.revision).toBe(revision);
});

it("preserves old children when allocation hits the document node limit", () => {
	const document = new DocumentTree("https://fixture.invalid/limit", {
		maxNodes: 3,
	});
	trees.push(document);
	const editor = document.createElement("div", { contenteditable: "" });
	document.append(document.root, editor);
	document.setTextContent(editor, "Old");
	const reference = document.reference(editor);
	expect(prepareControlFill(document, reference, "New")).toMatchObject({
		value: "New",
	});
	const old = [...document.get(editor).children];
	expect(() => documentInteractions(document).fill(reference, "New")).toThrow(
		/node limit/,
	);
	expect(document.get(editor).children).toEqual(old);
	expect(document.textContent(editor)).toBe("Old");
});

async function commandFixture() {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: 1,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				'<div id="editor" contenteditable aria-label="Message">Old</div>',
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/editable-fill"]);
	const page = session.page(session.tabs()[0].id);
	const editor = page.queries.querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	return { host, page, editor };
}

it("fills a contenteditable region through the native command host", async () => {
	const { host, page, editor } = await commandFixture();
	const result = await host.execute(["fill", "#editor", "Command text"]);
	expect(result.data).toMatchObject({
		reference: page.document.reference(editor),
		defaultPrevented: false,
	});
	expect(page.document.textContent(editor)).toBe("Command text");
});

it.each(["New", ""])(
	"reports plain text insertion or deletion for %j",
	(value) => {
		const { document, interactions, ref, id } = fixture();
		const seen: unknown[] = [];
		for (const type of ["beforeinput", "input"])
			interactions.events.addEventListener(id("#editor"), type, (event) => {
				if (!(event instanceof BrowserInputEvent))
					throw new Error("Expected input event");
				seen.push([event.type, event.inputType, event.data, event.isComposing]);
			});
		interactions.fill(ref(), value);
		expect(seen).toEqual(
			["beforeinput", "input"].map((type) => [
				type,
				value ? "insertText" : "deleteContentBackward",
				value || null,
				false,
			]),
		);
		expect(document.textContent(id("#editor"))).toBe(value);
	},
);

it.each(["beforeinput", "input"])(
	"passes command abort through %s without late writes",
	async (phase) => {
		const { host, page, editor } = await commandFixture();
		await host.execute(["fill", "#editor", "Before"]);
		const controller = new AbortController();
		page.interactions.events.addEventListener(
			editor,
			phase,
			() => {
				queueMicrotask(() => controller.abort());
			},
			{ once: true },
		);
		await expect(
			host.execute(["fill", "#editor", "After"], { signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
		expect(page.document.textContent(editor)).toBe(
			phase === "beforeinput" ? "Before" : "After",
		);
		expect(page.interactions.events.metrics().activeDispatches).toBe(0);
	},
);

it("rejects a pre-aborted replacement without focus or mutation", async () => {
	const { document, interactions, ref } = fixture();
	expect(prepareControlFill(document, ref(), "New")).toMatchObject({
		value: "New",
	});
	const revision = document.revision;
	await expect(
		interactions.fillAsync(ref(), "New", AbortSignal.abort()),
	).rejects.toMatchObject({ code: "aborted" });
	expect(document.revision).toBe(revision);
});

it("revalidates a descendant's editing root after ancestor changes", () => {
	const { document, interactions, ref, id } = fixture(
		'<div id="editor" contenteditable><div id="nested" contenteditable><span id="child">Old</span></div></div>',
	);
	let entered = false;
	interactions.events.addEventListener(id("#editor"), "beforeinput", () => {
		entered = true;
		document.setAttribute(id("#editor"), "contenteditable", "false");
	});
	expect(() => interactions.fill(ref("#child"), "Rejected")).toThrow(/changed/);
	expect(entered).toBe(true);
	expect(document.textContent(id("#child"))).toBe("Old");
});

it("does not invent current form-control values for editable DOM content", () => {
	const { document, interactions, ref, id } = fixture();
	interactions.fill(ref(), "DOM text");
	expect(document.get(id("#editor")).control).toEqual({});
	expect(document.wasUserEditedValue(id("#editor"))).toBe(false);
});

it.each([
	'input type="checkbox"',
	'input type="hidden"',
	"select",
	"br",
	"img",
])("does not treat %s as an editable text container", (tag) => {
	const { document, interactions, ref, id } = fixture(
		`<div id="editor" contenteditable><${tag} id="control" contenteditable></${tag.split(" ")[0]}></div>`,
	);
	interactions.fill(ref(), "Support established");
	const control = document.createElement(tag.split(" ")[0], {
		contenteditable: "",
		...(tag.includes("checkbox")
			? { type: "checkbox" }
			: tag.includes("hidden")
				? { type: "hidden" }
				: {}),
	});
	document.append(id("#editor"), control);
	expect(() =>
		interactions.fill(document.reference(control), "Rejected"),
	).toThrow();
	expect(document.get(control).children).toHaveLength(0);
});
