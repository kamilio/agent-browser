import { expect, it, vi } from "vitest";
import { mountTraceReview } from "./trace-view.js";

class ElementFixture {
	textContent = "";
	value = "";
	disabled = false;
	files?: Pick<File, "size" | "stream">[];
	children: ElementFixture[] = [];
	listeners = new Map<string, (() => void)[]>();
	set innerHTML(_value: string) {
		throw new Error("Trace content must not become HTML");
	}
	set href(_value: string) {
		throw new Error("Trace content must not become a link");
	}
	addEventListener(event: string, listener: () => void) {
		this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
	}
	removeEventListener(event: string, listener: () => void) {
		this.listeners.set(
			event,
			(this.listeners.get(event) ?? []).filter((value) => value !== listener),
		);
	}
	replaceChildren(...children: ElementFixture[]) {
		this.children = children;
	}
	dispatch(event: string) {
		for (const listener of this.listeners.get(event) ?? []) listener();
	}
}
function file(name = "First heading", count = 2) {
	const frame = (index: number) => ({
		sequence: index,
		atMs: index,
		action: {
			command: index === 0 ? "tracing-start" : "fill",
			outcome: "returned",
			durationMs: 0,
		},
		activeTab: "tab-1",
		tabs: [
			{
				id: "tab-1",
				selected: true,
				loading: false,
				documentRef: "e1",
				url: "https://fixture.invalid/",
			},
		],
		snapshot: {
			document: "e1",
			scope: "e1",
			revision: index,
			truncated: false,
			entries: [
				{
					ref: "e2",
					role: "heading",
					name: index === 0 ? name : "Second heading",
					depth: 0,
				},
			],
		},
	});
	return new Blob([
		JSON.stringify({
			format: "agent-browser-trace-v1",
			schemaVersion: 1,
			partial: true,
			startedAt: "2026-09-03T12:00:00.000Z",
			endedAt: "2026-09-03T12:00:01.000Z",
			droppedFrames: 0,
			truncated: false,
			frames: Array.from({ length: count }, (_, index) => frame(index)),
		}),
	]);
}
function fixture() {
	const elements = new Map<string, ElementFixture>();
	for (const id of [
		"trace-file",
		"trace-frame",
		"trace-previous",
		"trace-next",
		"trace-status",
		"trace-clear",
		"trace-snapshot",
		"trace-network",
		"trace-metadata",
	])
		elements.set(id, new ElementFixture());
	const get = (id: string) => {
		const value = elements.get(id);
		if (!value) throw new Error("Missing test element");
		return value;
	};
	const created: string[] = [];
	const document = {
		getElementById: get,
		createElement: (tag: string) => {
			created.push(tag);
			return new ElementFixture();
		},
	};
	const viewer = mountTraceReview(document as unknown as Document);
	return {
		get,
		document: document as unknown as Document,
		viewer,
		created,
		choose(value: Pick<File, "size" | "stream">) {
			get("trace-file").files = [value];
			get("trace-file").dispatch("change");
		},
	};
}

it("loads a local trace without a session and navigates bounded frames", async () => {
	const { get, choose, viewer } = fixture();
	try {
		expect(get("trace-file").disabled).toBe(false);
		choose(file());
		await vi.waitFor(() => expect(get("trace-frame").children).toHaveLength(2));
		expect(get("trace-snapshot").textContent).toContain("First heading");
		expect(get("trace-previous").disabled).toBe(true);
		get("trace-next").dispatch("click");
		expect(get("trace-snapshot").textContent).toContain("Second heading");
		expect(get("trace-next").disabled).toBe(true);
		get("trace-previous").dispatch("click");
		expect(get("trace-snapshot").textContent).toContain("First heading");
		get("trace-frame").value = "1";
		get("trace-frame").dispatch("change");
		expect(get("trace-snapshot").textContent).toContain("Second heading");
	} finally {
		viewer.close();
	}
});

it("renders hostile-looking text without constructing HTML, links or requests", async () => {
	const network = vi.fn();
	vi.stubGlobal("fetch", network);
	const { get, choose, created, viewer } = fixture();
	try {
		choose(file('<img src="https://evil.invalid/" onerror="steal()">'));
		await vi.waitFor(() =>
			expect(get("trace-snapshot").textContent).toContain("<img"),
		);
		expect(created).toEqual(["option", "option"]);
		expect(network).not.toHaveBeenCalled();
	} finally {
		viewer.close();
		vi.unstubAllGlobals();
	}
});

it("clears private text and options on explicit clear and close", async () => {
	const { get, choose, viewer } = fixture();
	choose(file("private document"));
	await vi.waitFor(() =>
		expect(get("trace-snapshot").textContent).toContain("private document"),
	);
	get("trace-clear").dispatch("click");
	expect(get("trace-snapshot").textContent).not.toContain("private document");
	expect(get("trace-frame").children).toEqual([]);
	choose(file("another private document"));
	await vi.waitFor(() =>
		expect(get("trace-snapshot").textContent).toContain(
			"another private document",
		),
	);
	viewer.close();
	viewer.close();
	expect(get("trace-snapshot").textContent).toBe("No frame selected.");
	expect(get("trace-next").disabled).toBe(true);
	choose(file("must not reload"));
	expect(get("trace-frame").children).toEqual([]);
});

it("detaches every listener on close and can remount without stale handlers", async () => {
	const { get, document, choose, viewer } = fixture();
	const controls = [
		["trace-file", "change"],
		["trace-frame", "change"],
		["trace-previous", "click"],
		["trace-next", "click"],
		["trace-clear", "click"],
	] as const;
	viewer.close();
	for (const [id, event] of controls)
		expect(get(id).listeners.get(event)).toHaveLength(0);
	const remounted = mountTraceReview(document);
	try {
		for (const [id, event] of controls)
			expect(get(id).listeners.get(event)).toHaveLength(1);
		choose(file("remounted private text"));
		await vi.waitFor(() =>
			expect(get("trace-snapshot").textContent).toContain(
				"remounted private text",
			),
		);
		viewer.close();
		expect(get("trace-snapshot").textContent).toContain(
			"remounted private text",
		);
		get("trace-next").dispatch("click");
		expect(get("trace-snapshot").textContent).toContain("Second heading");
	} finally {
		remounted.close();
	}
	for (const [id, event] of controls)
		expect(get(id).listeners.get(event)).toHaveLength(0);
});

it("aborts replaced file streams and never installs their stale results", async () => {
	const { get, choose, viewer } = fixture();
	const canceled = vi.fn();
	const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
		cancel: canceled,
	});
	choose({ size: 100, stream: () => stream });
	choose(file("Replacement"));
	await vi.waitFor(() =>
		expect(get("trace-snapshot").textContent).toContain("Replacement"),
	);
	expect(canceled).toHaveBeenCalledOnce();
	expect(stream.locked).toBe(false);
	viewer.close();
});

it.each(["clear", "close"])("cancels pending input on %s", async (action) => {
	const { get, choose, viewer } = fixture();
	const canceled = vi.fn();
	const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
		cancel: canceled,
	});
	choose({ size: 100, stream: () => stream });
	if (action === "clear") get("trace-clear").dispatch("click");
	else viewer.close();
	await vi.waitFor(() => expect(stream.locked).toBe(false));
	expect(canceled).toHaveBeenCalledOnce();
	expect(get("trace-frame").children).toEqual([]);
	viewer.close();
});

it("rejects a bad file without leaving an old document on screen", async () => {
	const { get, choose, viewer } = fixture();
	choose(file("old private text"));
	await vi.waitFor(() => expect(get("trace-frame").children).toHaveLength(2));
	choose(new Blob(["not JSON"]));
	await vi.waitFor(() =>
		expect(get("trace-status").textContent).toContain("Invalid or unsupported"),
	);
	expect(get("trace-snapshot").textContent).not.toContain("old private text");
	expect(get("trace-frame").disabled).toBe(true);
	viewer.close();
});

it("handles zero-frame exports and refuses out-of-range selections", async () => {
	const { get, choose, viewer } = fixture();
	choose(file("empty", 0));
	await vi.waitFor(() =>
		expect(get("trace-status").textContent).toContain("0 frames"),
	);
	expect(get("trace-frame").disabled).toBe(true);
	choose(file());
	await vi.waitFor(() => expect(get("trace-frame").children).toHaveLength(2));
	get("trace-frame").value = "999";
	get("trace-frame").dispatch("change");
	expect(get("trace-snapshot").textContent).toContain("First heading");
	viewer.close();
});
