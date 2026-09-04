import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";

interface TabRow {
	index: number;
	id: string;
	key: string;
	selected: boolean;
	documentRef: string | null;
	url: string | null;
}
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});
function gate() {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}
function fixture(wait?: (url: string) => Promise<void>) {
	const sessions = new Map<string, BrowserSession>();
	const host = new BrowserCommandHost({
		createSession(name) {
			const session = new BrowserSession({
				createTransport: () => ({
					async request(request) {
						await wait?.(request.url);
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
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) =>
					parseHtmlDocument('<h1>Tab</h1><input id="field">', response.url),
			});
			sessions.set(name, session);
			return session;
		},
	});
	hosts.push(host);
	const rows = async (session = "default") =>
		(await host.execute(["tab-list"], { session })).data as TabRow[];
	const open = async (session = "default") => {
		await host.execute(["open", "https://fixture.invalid/tabs"], { session });
		return rows(session);
	};
	return { host, sessions, rows, open };
}

it("uses the same opaque tab identity in open, tab-new, tab-list and session list", async () => {
	const { host, open, rows, sessions } = fixture();
	const first = (await open())[0];
	expect(first.key).toEqual(expect.any(String));
	expect(first.key.length).toBeGreaterThan(0);
	const created = (await host.execute(["tab-new"])).data as { tabs: TabRow[] };
	expect(created.tabs[0].key).toBe(first.key);
	expect(created.tabs[1]).toMatchObject({
		index: 1,
		documentRef: null,
		url: null,
	});
	expect(new Set(created.tabs.map((tab) => tab.key)).size).toBe(2);
	expect(await rows()).toEqual(created.tabs);
	expect((await host.execute(["list"])).data).toMatchObject([
		{ name: "default", tabs: created.tabs },
	]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing session");
	for (const tab of created.tabs)
		expect(tab.key).toBe(browser.viewport(tab.id).key);
});

it.each(["tab-select", "tab-close"])(
	"advertises %s guard options in help and capabilities",
	async (command) => {
		const { host } = fixture();
		expect((await host.execute(["help", command])).data).toMatchObject({
			commands: [
				{
					name: command,
					options: { "expected-key": { kind: "string" } },
					availableOptions: ["expected-key"],
					status: "partial",
				},
			],
		});
		expect(
			host.capabilities().commands.find((entry) => entry.name === command),
		).toMatchObject({ options: ["expected-key"] });
		expect(host.metrics().sessions).toBe(0);
	},
);

it.each(["tab-select", "tab-close"])(
	"rejects a foreign named-session identity for %s despite matching tab IDs",
	async (command) => {
		const { host, open, rows } = fixture();
		const first = (await open("first"))[0];
		const second = (await open("second"))[0];
		expect(first.id).toBe(second.id);
		expect(first.key).not.toBe(second.key);
		await expect(
			host.execute([command, "0", `--expected-key=${first.key}`], {
				session: "second",
			}),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(await rows("second")).toEqual([second]);
		expect(await rows("first")).toEqual([first]);
	},
);

it.each(["tab-select", "tab-close"])(
	"rejects recreated-session identities before %s changes the new session",
	async (command) => {
		const { host, open, rows } = fixture();
		const original = (await open())[0];
		await host.execute(["close"]);
		const replacement = (await open())[0];
		expect(replacement.id).toBe(original.id);
		expect(replacement.key).not.toBe(original.key);
		await expect(
			host.execute([command, "0", `--expected-key=${original.key}`]),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(await rows()).toEqual([replacement]);
	},
);

it.each(["tab-select", "tab-close"])(
	"checks %s identity after earlier queued tab closures",
	async (command) => {
		const entered = gate();
		const waiting = gate();
		const { host, open, rows } = fixture(async (url) => {
			if (url.endsWith("/hold")) {
				entered.release();
				await waiting.pending;
			}
		});
		await open();
		await host.execute(["tab-new"]);
		await host.execute(["tab-new"]);
		const before = await rows();
		const navigation = host.execute(["goto", "https://fixture.invalid/hold"]);
		await entered.pending;
		const closing = host.execute([
			"tab-close",
			"0",
			`--expected-key=${before[0].key}`,
		]);
		const stale = host.execute([
			command,
			"1",
			`--expected-key=${before[1].key}`,
		]);
		const results = Promise.allSettled([closing, stale]);
		waiting.release();
		try {
			await navigation;
			const [closed, rejected] = await results;
			expect(closed.status).toBe("fulfilled");
			expect(rejected).toMatchObject({
				status: "rejected",
				reason: { code: "stale-reference" },
			});
			const after = await rows();
			expect(after.map((tab) => tab.key)).toEqual(
				before.slice(1).map((tab) => tab.key),
			);
			expect(after[1].selected).toBe(true);
		} finally {
			waiting.release();
			await Promise.allSettled([navigation, results]);
		}
	},
);

it("guards the implicit selected tab at execution time, not enqueue time", async () => {
	const entered = gate();
	const waiting = gate();
	const { host, open, rows, sessions } = fixture(async (url) => {
		if (url.endsWith("/hold")) {
			entered.release();
			await waiting.pending;
		}
	});
	await open();
	await host.execute(["tab-new"]);
	const before = await rows();
	const navigation = host.execute(["goto", "https://fixture.invalid/hold"]);
	await entered.pending;
	const operation = host.execute([
		"tab-close",
		`--expected-key=${before[1].key}`,
	]);
	const result = Promise.allSettled([operation]);
	sessions.get("default")?.selectTab(before[0].id);
	waiting.release();
	try {
		await navigation;
		expect(await result).toMatchObject([
			{ status: "rejected", reason: { code: "stale-reference" } },
		]);
		expect((await rows()).map((tab) => tab.key)).toEqual(
			before.map((tab) => tab.key),
		);
		expect((await rows())[0].selected).toBe(true);
	} finally {
		waiting.release();
		await Promise.allSettled([navigation, result]);
	}
});

it.each(["tab-select", "tab-close"])(
	"keeps cached snapshots and documents intact after stale %s",
	async (command) => {
		const { host, open, rows, sessions } = fixture();
		const first = (await open())[0];
		await host.execute(["snapshot"]);
		const bytes = host.metrics().cachedSnapshotBytes;
		expect(bytes).toBeGreaterThan(0);
		const tree = sessions.get("default")?.page(first.id).document;
		await expect(
			host.execute([command, "0", "--expected-key=stale"]),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(host.metrics().cachedSnapshotBytes).toBe(bytes);
		expect(tree?.get(tree.root).kind).toBe("document");
		expect(await rows()).toEqual([first]);
	},
);

it("cleans up the matching tab and its snapshot without closing other tabs", async () => {
	const { host, open, rows, sessions } = fixture();
	const first = (await open())[0];
	await host.execute(["snapshot"]);
	const tree = sessions.get("default")?.page(first.id).document;
	await host.execute(["tab-new"]);
	const second = (await rows())[1];
	await host.execute(["tab-close", "0", `--expected-key=${first.key}`]);
	expect(host.metrics().cachedSnapshotBytes).toBe(0);
	expect(() => tree?.get(tree.root)).toThrow(/closed/);
	expect(await rows()).toEqual([{ ...second, index: 0 }]);
});

it("keeps identity through navigation and resize without freezing the document", async () => {
	const { host, open, rows } = fixture();
	const first = (await open())[0];
	await host.execute(["goto", "https://fixture.invalid/next"]);
	await host.execute(["resize", "640", "480"]);
	const current = (await rows())[0];
	expect(current.key).toBe(first.key);
	expect(current.documentRef).not.toBe(first.documentRef);
	await host.execute(["tab-select", "0", `--expected-key=${first.key}`]);
	await host.execute(["tab-close", `--expected-key=${first.key}`]);
	expect(await rows()).toEqual([]);
	await host.execute(["tab-new"]);
	const replacement = (await rows())[0];
	expect(replacement.key).not.toBe(first.key);
	expect(replacement.id).not.toBe(first.id);
});

it.each(
	["tab-select", "tab-close"].flatMap((command) =>
		["", "x".repeat(257)].map((key) => [command, key] as const),
	),
)(
	"rejects malformed keys for %s without changing tabs",
	async (command, key) => {
		const { host, open, rows } = fixture();
		const before = await open();
		await expect(
			host.execute([command, "0", `--expected-key=${key}`]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(await rows()).toEqual(before);
	},
);

it.each(["-1", "01", "1.5", "1e0"])(
	"does not let a valid key bypass invalid index %s",
	async (index) => {
		const { host, open, rows } = fixture();
		const before = await open();
		await expect(
			host.execute(["tab-close", index, `--expected-key=${before[0].key}`]),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(await rows()).toEqual(before);
	},
);

it("does not revive a timed-out guarded close when the queue resumes", async () => {
	const entered = gate();
	const waiting = gate();
	const { host, open, rows } = fixture(async (url) => {
		if (url.endsWith("/hold")) {
			entered.release();
			await waiting.pending;
		}
	});
	const first = (await open())[0];
	const navigation = host.execute(["goto", "https://fixture.invalid/hold"]);
	await entered.pending;
	try {
		await expect(
			host.execute([
				"tab-close",
				"0",
				`--expected-key=${first.key}`,
				"--timeout=10",
			]),
		).rejects.toMatchObject({ code: "timeout" });
	} finally {
		waiting.release();
		await navigation;
	}
	expect((await rows()).map((tab) => tab.key)).toEqual([first.key]);
	expect(host.metrics().pendingCommands).toBe(0);
});

it("retains the unguarded indexed forms for existing clients", async () => {
	const { host, open, rows } = fixture();
	await open();
	await host.execute(["tab-new"]);
	await host.execute(["tab-select", "0"]);
	expect((await rows())[0].selected).toBe(true);
	await host.execute(["tab-close"]);
	expect(await rows()).toHaveLength(1);
});
