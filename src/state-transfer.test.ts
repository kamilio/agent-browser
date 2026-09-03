import { afterEach, expect, it, vi } from "vitest";
import { exportBrowserState } from "./browser-state.js";
import { BrowserCommandHost } from "./command-host.js";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import { scriptFrame, scriptFrameLimit } from "./node-script-protocol.js";
import { SessionProcessHost } from "./node-session-host.js";
import { BrowserSession } from "./session.js";
import {
	type StateExecutor,
	downloadBrowserState,
	uploadBrowserState,
} from "./state-client.js";
import {
	StateTransfers,
	decodeStateChunk,
	encodeStateChunk,
	stateTransferLimits,
} from "./state-transfer.js";
import { BrowserStorage } from "./storage.js";

const url = "https://example.com/";
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

function owner() {
	const cookies = new CookieJar();
	const storage = new BrowserStorage();
	storage.openTab("first");
	cookies.setCookie(url, "session=synthetic-secret; Path=/; Secure; HttpOnly", {
		siteUrl: url,
	});
	storage.localStorage("first", url).setItem("name", "😀\ud800");
	storage.sessionStorage("first", url).setItem("draft", "keep");
	return { cookies, storage };
}

async function fixture() {
	const sessions = new Map<string, BrowserSession>();
	const host = new BrowserCommandHost({
		createSession: (name) => {
			const browser = new BrowserSession({
				createTransport: () => ({
					request: async () => {
						throw new Error("Unexpected network request");
					},
					metrics: () => ({
						requests: 0,
						active: 0,
						closed: false,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
					}),
					close: () => {},
				}),
				loadDocument: () => {
					throw new Error("Unexpected document load");
				},
			});
			sessions.set(name, browser);
			return browser;
		},
	});
	hosts.push(host);
	await host.execute(["open"], { session: "first" });
	const execute = vi.fn(async (argv: readonly string[]) => {
		expect(
			Buffer.byteLength(JSON.stringify({ argv, session: "s".repeat(64) })),
		).toBeLessThanOrEqual(65_536);
		const request = scriptFrame({
			schemaVersion: 1,
			type: "command",
			id: 1,
			argv,
		});
		expect(Buffer.byteLength(request)).toBeLessThanOrEqual(262_144);
		const result = await host.execute(JSON.parse(request).argv, {
			session: "first",
		});
		const response = scriptFrame(result);
		expect(Buffer.byteLength(response)).toBeLessThanOrEqual(scriptFrameLimit);
		return JSON.parse(response);
	});
	return {
		host,
		sessions,
		execute,
		browser: sessions.get("first") as BrowserSession,
	};
}

it("transfers a multi-chunk Unicode state through actual command parsing and frame serialization", async () => {
	const { browser, host, execute } = await fixture();
	const source = owner();
	source.storage
		.localStorage("first", url)
		.setItem("large", "😀".repeat(50_000));
	const json = JSON.stringify(exportBrowserState(source));
	await expect(uploadBrowserState(json, execute)).resolves.toEqual({
		loaded: true,
		bytes: Buffer.byteLength(json),
	});
	expect(exportBrowserState(browser)).toEqual(exportBrowserState(source));
	const downloaded = await downloadBrowserState(execute);
	expect(JSON.parse(downloaded.json)).toEqual(exportBrowserState(source));
	expect(downloaded.remoteCleanupConfirmed).toBe(true);
	expect(host.metrics().stateTransfers).toMatchObject({
		transfers: 0,
		bytes: 0,
	});
	expect(
		execute.mock.calls.filter(([argv]) => argv[0] === "state-import-append")
			.length,
	).toBeGreaterThan(1);
});

it("keeps exports frozen at capture time and omits credentials from metadata and metrics", () => {
	const source = owner();
	const transfers = new StateTransfers();
	const before = exportBrowserState(source);
	const info = transfers.export(source);
	source.cookies.clear();
	source.storage.localStorage("first", url).clear();
	expect(
		JSON.parse(
			new TextDecoder().decode(
				decodeStateChunk(transfers.read(source, info.id, 0).data),
			),
		),
	).toEqual(before);
	expect(JSON.stringify([info, transfers.metrics()])).not.toContain(
		"synthetic-secret",
	);
	expect(Object.isFrozen(info)).toBe(true);
	transfers.clear(source);
});

it("binds transfers to owner identity and revokes them on named-session close/recreation", async () => {
	const { host, browser, execute } = await fixture();
	const info = (await execute(["state-export"])).data;
	await host.execute(["open"], { session: "second" });
	await expect(
		host.execute(["state-transfer-read", info.id, "0"], { session: "second" }),
	).rejects.toMatchObject({ code: "not-found" });
	await host.execute(["close"], { session: "first" });
	expect(host.metrics().stateTransfers.transfers).toBe(0);
	await host.execute(["open"], { session: "first" });
	await expect(
		execute(["state-transfer-read", info.id, "0"]),
	).rejects.toMatchObject({ code: "not-found" });
	expect(browser.metrics().closed).toBe(true);
});

it("reserves incomplete import capacity, expires both directions and does not extend TTL on reads", () => {
	let now = 0;
	const source = owner();
	const transfers = new StateTransfers(
		{ maxBytes: 1024, maxTransfers: 2, ttlMs: 10 },
		() => now,
	);
	const exported = transfers.export(source);
	const pending = transfers.begin(source, 1024 - exported.bytes);
	expect(transfers.metrics().bytes).toBe(1024);
	expect(() => transfers.begin(source, 1)).toThrow("capacity");
	now = 9;
	transfers.read(source, exported.id, 0);
	now = 10;
	expect(() => transfers.read(source, exported.id, 0)).toThrow("not found");
	expect(() => transfers.append(source, pending.id, 0, "e30=")).toThrow(
		"not found",
	);
	expect(transfers.metrics()).toMatchObject({ transfers: 0, bytes: 0 });
});

it.each([0, -1, 1.5, Number.NaN, stateTransferLimits.maxBytes + 1])(
	"rejects invalid reservation size %s",
	(size) => {
		const transfers = new StateTransfers();
		expect(() => transfers.begin(owner(), size)).toThrow("capacity");
		expect(transfers.metrics().bytes).toBe(0);
	},
);

it("rejects export budget overflow without evicting another transfer", () => {
	const source = owner();
	const transfers = new StateTransfers({ maxBytes: 20 });
	const pending = transfers.begin(source, 2);
	expect(() => transfers.export(source)).toThrow("capacity");
	expect(transfers.metrics()).toMatchObject({ transfers: 1, bytes: 2 });
	transfers.delete(source, pending.id);
});

it.each(["", "@@==", "e31=", "e30", "e30=\n", "-_=="])(
	"rejects noncanonical base64 case %# without advancing an import",
	(data) => {
		const source = owner();
		const transfers = new StateTransfers();
		const info = transfers.begin(source, 2);
		expect(() => transfers.append(source, info.id, 0, data)).toThrow(
			"encoding",
		);
		expect(transfers.append(source, info.id, 0, "e30=").receivedBytes).toBe(2);
		transfers.clear(source);
	},
);

it("rejects out-of-order, duplicate, oversized and wrong-direction chunks", () => {
	const source = owner();
	const transfers = new StateTransfers();
	const info = transfers.begin(source, 2);
	expect(() => transfers.append(source, info.id, 1, "ew==")).toThrow("offset");
	expect(() => transfers.append(source, info.id, 0, "e30g")).toThrow(
		"remaining",
	);
	transfers.append(source, info.id, 0, "ew==");
	expect(() => transfers.append(source, info.id, 0, "ew==")).toThrow("offset");
	expect(() => transfers.read(source, info.id, 0)).toThrow("direction");
	expect(() => transfers.commit(source, info.id)).toThrow("incomplete");
	expect(transfers.append(source, info.id, 1, "fQ==").receivedBytes).toBe(2);
	transfers.clear(source);
});

it.each(["{", "{}", '{"schemaVersion":1,"cookies":[],"origins":[null]}'])(
	"discards a failed complete import atomically, case %#",
	(json) => {
		const source = owner();
		const before = exportBrowserState(source);
		const transfers = new StateTransfers();
		const content = new TextEncoder().encode(json);
		const info = transfers.begin(source, content.length);
		transfers.append(source, info.id, 0, encodeStateChunk(content));
		expect(() => transfers.commit(source, info.id)).toThrow();
		expect(exportBrowserState(source)).toEqual(before);
		expect(transfers.metrics()).toMatchObject({ transfers: 0, bytes: 0 });
		expect(() => transfers.commit(source, info.id)).toThrow("not found");
	},
);

it("rejects invalid UTF-8 and releases a complete import", () => {
	const source = owner();
	const transfers = new StateTransfers();
	const info = transfers.begin(source, 1);
	transfers.append(source, info.id, 0, "/w==");
	expect(() => transfers.commit(source, info.id)).toThrow("UTF-8");
	expect(transfers.metrics().bytes).toBe(0);
});

it.each(["offset", "totalBytes", "bytes", "eof", "id", "session"])(
	"rejects corrupted download %s and attempts cleanup",
	async (field) => {
		const { execute, host } = await fixture();
		const faulty: StateExecutor = async (argv) => {
			const result = await execute(argv);
			if (argv[0] === "state-transfer-read") {
				if (field === "session") result.session = "other";
				else
					result.data[field] =
						field === "eof" ? false : field === "id" ? "other" : -1;
			}
			return result;
		};
		await expect(downloadBrowserState(faulty)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(host.metrics().stateTransfers.bytes).toBe(0);
	},
);

it("reports remote export cleanup failure honestly", async () => {
	const { execute, host } = await fixture();
	const result = await downloadBrowserState(async (argv) => {
		if (argv[0] === "state-transfer-delete")
			throw new Error("synthetic-secret");
		return execute(argv);
	});
	expect(result.remoteCleanupConfirmed).toBe(false);
	expect(host.metrics().stateTransfers.transfers).toBe(1);
	host.close();
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("does not commit after a corrupt upload acknowledgement and releases pending bytes", async () => {
	const { execute, browser, host } = await fixture();
	const before = exportBrowserState(browser);
	await expect(
		uploadBrowserState(
			JSON.stringify(exportBrowserState(owner())),
			async (argv) => {
				const result = await execute(argv);
				if (argv[0] === "state-import-append") result.data.receivedBytes--;
				return result;
			},
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(exportBrowserState(browser)).toEqual(before);
	expect(
		execute.mock.calls.some(([argv]) => argv[0] === "state-import-commit"),
	).toBe(false);
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("never retries a commit when the response is lost after the mutation", async () => {
	const { execute, browser, host } = await fixture();
	const source = owner();
	await expect(
		uploadBrowserState(
			JSON.stringify(exportBrowserState(source)),
			async (argv) => {
				const result = await execute(argv);
				if (argv[0] === "state-import-commit")
					throw new Error("synthetic-secret");
				return result;
			},
		),
	).rejects.toThrow("not confirmed");
	expect(exportBrowserState(browser)).toEqual(exportBrowserState(source));
	expect(
		execute.mock.calls.filter(([argv]) => argv[0] === "state-import-commit"),
	).toHaveLength(1);
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("sanitizes command failures and rejects invalid JSON before creating an import", async () => {
	const execute = vi.fn(async () => {
		throw new AgentBrowserError("aborted", "synthetic-secret");
	});
	await expect(
		uploadBrowserState('{"synthetic-secret":', execute),
	).rejects.toMatchObject({
		code: "invalid-input",
		message: "State transfer failed",
	});
	expect(execute).not.toHaveBeenCalled();
	await expect(downloadBrowserState(execute)).rejects.toMatchObject({
		code: "aborted",
		message: "State transfer failed",
	});
});

it("routes state commands through the actual process-host dispatcher with an injected actor", async () => {
	const { host } = await fixture();
	let closed = false;
	let exited = () => {};
	const completion = new Promise<void>((resolve) => {
		exited = resolve;
	});
	const processHost = new SessionProcessHost({
		process: { packageRoot: "/unused-native-test-runtime" },
		createProcess: async () => ({
			session: "first",
			exited: completion,
			execute: (argv, options) => host.execute(argv, options),
			close: async () => {
				closed = true;
				host.close();
				exited();
			},
			metrics: () => ({ closed, terminating: false }),
			info: () => ({ pid: 1234, version: "native-fixture", session: "first" }),
		}),
	});
	try {
		const execute: StateExecutor = (argv) =>
			processHost.execute(argv, { session: "first" });
		await execute(["open"]);
		const state = exportBrowserState(owner());
		await uploadBrowserState(JSON.stringify(state), execute);
		expect(JSON.parse((await downloadBrowserState(execute)).json)).toEqual(
			state,
		);
	} finally {
		await processHost.close();
	}
});

it("aborts before commit when an append acknowledgement is lost and cleans pending state", async () => {
	const { execute, browser, host } = await fixture();
	const before = exportBrowserState(browser);
	await expect(
		uploadBrowserState(
			JSON.stringify(exportBrowserState(owner())),
			async (argv) => {
				const result = await execute(argv);
				if (argv[0] === "state-import-append")
					throw new Error("synthetic-secret");
				return result;
			},
		),
	).rejects.toThrow("State transfer failed");
	expect(exportBrowserState(browser)).toEqual(before);
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("rejects short export chunks rather than allowing an unbounded number of requests", async () => {
	const { execute, host } = await fixture();
	await expect(
		downloadBrowserState(async (argv) => {
			const result = await execute(argv);
			if (argv[0] === "state-transfer-read") {
				result.data.data = "ew==";
				result.data.bytes = 1;
				result.data.eof = false;
			}
			return result;
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("releases abandoned transfers on a timer without waiting for another command", () => {
	vi.useFakeTimers();
	try {
		const transfers = new StateTransfers({ ttlMs: 10 }, () => 0);
		transfers.begin(owner(), 20);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(10);
		expect(vi.getTimerCount()).toBe(0);
		expect(transfers.metrics()).toMatchObject({ bytes: 0, transfers: 0 });
	} finally {
		vi.useRealTimers();
	}
});
