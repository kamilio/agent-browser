import { afterEach, expect, it, vi } from "vitest";
import type { CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import { type SessionActor, SessionProcessHost } from "./node-session-host.js";

const hosts: SessionProcessHost[] = [];
function actor(session: string): SessionActor {
	let resolveExit = () => {};
	let closed = false;
	const exited = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});
	return {
		session,
		exited,
		execute: vi.fn(
			async (argv: readonly string[]): Promise<CommandResult> => ({
				schemaVersion: 1,
				command: argv.find((argument) => !argument.startsWith("-")) ?? "help",
				session,
				data: argv[0] === "list" ? [{ name: session, tabs: [] }] : { session },
			}),
		),
		close: vi.fn(async () => {
			closed = true;
			resolveExit();
		}),
		metrics: () => ({ closed, terminating: false }),
		info: () => ({
			pid: session === "first" ? 1234 : 5678,
			version: "fixture",
			session,
		}),
	};
}
function fixture(
	overrides: Partial<ConstructorParameters<typeof SessionProcessHost>[0]> = {},
) {
	const created: SessionActor[] = [];
	const createProcess = vi.fn(async ({ session }: { session?: string }) => {
		const value = actor(session ?? "default");
		created.push(value);
		return value;
	});
	const host = new SessionProcessHost({
		process: { packageRoot: "/tmp/unused-safejs-fixture" },
		createProcess,
		...overrides,
	});
	hosts.push(host);
	return { host, createProcess, created };
}
afterEach(async () => {
	for (const host of hosts.splice(0)) await host.close();
});

it("reports the default adapter as configuration only without creating an actor", async () => {
	const { host, createProcess } = fixture();
	expect(host.capabilities()).toMatchObject({
		runtimeAdapter: "legacy",
		runtimeValidation: "configuration-only",
	});
	await host.execute(["capabilities"]);
	expect(createProcess).not.toHaveBeenCalled();
});

it("copies explicit adapter selection and forwards it when a session starts", async () => {
	const processOptions = {
		packageRoot: "/tmp/unused-safejs-fixture",
		runtimeAdapter: "extension" as "extension" | "legacy",
		websiteScripts: "classic" as const,
	};
	const { host, createProcess } = fixture({ process: processOptions });
	processOptions.runtimeAdapter = "legacy";
	await host.execute(["open"], { session: "selected" });
	expect(createProcess).toHaveBeenCalledWith(
		expect.objectContaining({
			runtimeAdapter: "extension",
			websiteScripts: "classic",
			session: "selected",
		}),
	);
	expect(host.capabilities()).toMatchObject({
		runtimeAdapter: "extension",
		runtimeValidation: "configuration-only",
	});
});

it.each([null, "auto", "", false])(
	"rejects invalid host adapter %s without creating an actor",
	(runtimeAdapter) => {
		const createProcess = vi.fn();
		expect(
			() =>
				new SessionProcessHost({
					process: {
						packageRoot: "/tmp/unused-safejs-fixture",
						runtimeAdapter,
					} as never,
					createProcess,
				}),
		).toThrow("Invalid page runtime adapter");
		expect(createProcess).not.toHaveBeenCalled();
	},
);

it("forwards request journal commands to the selected actor without creating extra actors", async () => {
	const { host, created, createProcess } = fixture();
	await host.execute(["-s=first", "open"]);
	await host.execute(["-s=first", "requests"]);
	await host.execute(["-s=first", "request", "0"]);
	expect(created[0].execute).toHaveBeenCalledWith(
		["-s=first", "request", "0"],
		expect.anything(),
	);
	expect(createProcess).toHaveBeenCalledTimes(1);
	const capabilities = host.capabilities();
	expect(capabilities.pageFetch).toMatchObject({
		enabled: true,
		cors: true,
		partial: true,
	});
	expect(
		capabilities.commands.find((entry) => entry.name === "requests")?.status,
	).toBe("partial");
});

it("keeps close-all as a startup barrier and permits fresh explicit sessions afterward", async () => {
	let release = (_value: SessionActor) => {};
	const starting = new Promise<SessionActor>((resolve) => {
		release = resolve;
	});
	const createProcess = vi
		.fn()
		.mockImplementationOnce(() => starting)
		.mockImplementation(async (options) => actor(options.session));
	const { host } = fixture({ createProcess });
	const pending = host.execute(["open"]);
	const rejected = expect(pending).rejects.toMatchObject({ code: "closed" });
	const closing = host.execute(["close-all"]);
	await expect(host.execute(["-s=new", "open"])).rejects.toMatchObject({
		code: "closed",
	});
	const owned = actor("default");
	release(owned);
	await Promise.all([closing, rejected]);
	expect(owned.close).toHaveBeenCalledOnce();
	await host.execute(["-s=new", "open"]);
	expect(createProcess).toHaveBeenCalledTimes(2);
	expect(host.metrics().sessions).toBe(1);
});

it("rejects factory reuse without terminating the original owner", async () => {
	const shared = actor("first");
	const { host } = fixture({ createProcess: async () => shared });
	await host.execute(["-s=first", "open"]);
	await expect(host.execute(["-s=second", "open"])).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(shared.close).not.toHaveBeenCalled();
	expect(host.metrics().sessions).toBe(1);
	expect((await host.execute(["-s=first", "snapshot"])).session).toBe("first");
});

it("validates host allocation limits before any process can start", () => {
	for (const options of [
		{ maxSessions: 0 },
		{ maxSessions: 33 },
		{ maxPendingCommands: 257 },
		{ maxCommands: 1_000_001 },
	])
		expect(() => fixture(options)).toThrow(AgentBrowserError);
});

it("describes configured process evaluation without launching an actor", async () => {
	const { host, createProcess } = fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		pageEvaluation: true,
		websiteJavaScript: false,
		sessionExecution: "owned-node-process",
	});
	expect((await host.execute(["help", "eval"])).data).toMatchObject({
		commands: [expect.objectContaining({ name: "eval", status: "partial" })],
	});
	expect(createProcess).not.toHaveBeenCalled();
});

it("creates one actor per named session and routes subsequent calls", async () => {
	const { host, createProcess, created } = fixture();
	await host.execute(["open", "https://example.com/"], { session: "first" });
	await host.execute(["open", "https://example.com/"], { session: "second" });
	await host.execute(["eval", "42"], { session: "first" });
	expect(createProcess).toHaveBeenCalledTimes(2);
	expect(created[0].execute).toHaveBeenCalledTimes(2);
	expect(created[1].execute).toHaveBeenCalledTimes(1);
	const listed = (await host.execute(["list", "--timeout=25"])).data;
	expect(created[0].execute).toHaveBeenLastCalledWith(
		["list", "--timeout=25"],
		expect.objectContaining({ session: "first" }),
	);
	expect(listed).toEqual([
		expect.objectContaining({
			name: "first",
			process: { pid: 1234, version: "fixture" },
		}),
		expect.objectContaining({ name: "second" }),
	]);
});

it("rejects missing sessions, unsupported options and pre-aborted requests before creation", async () => {
	const { host, createProcess } = fixture();
	await expect(host.execute(["eval", "42"])).rejects.toMatchObject({
		code: "not-found",
	});
	await expect(
		host.execute(["open", "https://example.com/", "--headed"]),
	).rejects.toMatchObject({ code: "unsupported" });
	await expect(
		host.execute(["open", "https://example.com/"], {
			signal: AbortSignal.abort(),
		}),
	).rejects.toMatchObject({ code: "aborted" });
	await expect(host.execute(["eval", "42", "e1"])).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(createProcess).not.toHaveBeenCalled();
});

it("reserves one slot during concurrent startup", async () => {
	let release = (_value: SessionActor) => {};
	const starting = new Promise<SessionActor>((resolve) => {
		release = resolve;
	});
	const createProcess = vi.fn(() => starting);
	const { host } = fixture({ createProcess, maxSessions: 1 });
	const first = host.execute(["open", "https://example.com/"], {
		session: "first",
	});
	const second = host.execute(["open", "https://example.com/"], {
		session: "first",
	});
	await expect(
		host.execute(["open", "https://example.com/"], { session: "second" }),
	).rejects.toMatchObject({ code: "resource-limit" });
	release(actor("first"));
	await Promise.all([first, second]);
	expect(createProcess).toHaveBeenCalledTimes(1);
});

it("does not recreate an actor after failure until an explicit open", async () => {
	const { host, created, createProcess } = fixture();
	await host.execute(["open", "https://example.com/"]);
	await created[0].close();
	await expect(host.execute(["snapshot"])).rejects.toMatchObject({
		code: "not-found",
	});
	expect(createProcess).toHaveBeenCalledTimes(1);
	await host.execute(["open", "https://example.com/"]);
	expect(createProcess).toHaveBeenCalledTimes(2);
});

it("closes only the selected actor and keeps another session usable", async () => {
	const { host, created } = fixture();
	await host.execute(["-s=first", "open", "https://example.com/"]);
	await host.execute(["-s=second", "open", "https://example.com/"]);
	await host.execute(["-s=first", "close"]);
	expect(created[0].close).toHaveBeenCalledOnce();
	expect(created[1].close).not.toHaveBeenCalled();
	expect(
		(await host.execute(["snapshot"], { session: "second" })).session,
	).toBe("second");
});

it("awaits startup and termination when closing the whole host", async () => {
	let release = (_value: SessionActor) => {};
	const starting = new Promise<SessionActor>((resolve) => {
		release = resolve;
	});
	const { host } = fixture({ createProcess: () => starting });
	const pending = host.execute(["open", "https://example.com/"]);
	const rejected = expect(pending).rejects.toMatchObject({ code: "closed" });
	let finished = false;
	const closing = host.close().then(() => {
		finished = true;
	});
	await Promise.resolve();
	expect(finished).toBe(false);
	const owned = actor("default");
	release(owned);
	await Promise.all([closing, rejected]);
	expect(owned.close).toHaveBeenCalledOnce();
	expect(host.metrics().sessions).toBe(0);
});

it("kills a newly started actor if its opening command was canceled during startup", async () => {
	let release = (_value: SessionActor) => {};
	const starting = new Promise<SessionActor>((resolve) => {
		release = resolve;
	});
	const { host } = fixture({ createProcess: () => starting });
	const controller = new AbortController();
	const pending = host.execute(["open", "https://example.com/"], {
		signal: controller.signal,
	});
	controller.abort();
	const owned = actor("default");
	release(owned);
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(owned.close).toHaveBeenCalledOnce();
	expect(owned.execute).not.toHaveBeenCalled();
});

it("cleans failed startup reservations without discarding a healthy actor", async () => {
	const healthy = actor("first");
	const { host } = fixture({
		maxSessions: 2,
		createProcess: async (options) => {
			if (options.session === "second")
				throw new AgentBrowserError("unsupported", "fixture failure");
			return healthy;
		},
	});
	await host.execute(["-s=first", "open", "https://example.com/"]);
	await expect(
		host.execute(["-s=second", "open", "https://example.com/"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(host.metrics().sessions).toBe(1);
	expect((await host.execute(["-s=first", "snapshot"])).session).toBe("first");
});

it("bounds pending requests without creating extra actors", async () => {
	let release = (_value: SessionActor) => {};
	const starting = new Promise<SessionActor>((resolve) => {
		release = resolve;
	});
	const { host } = fixture({
		createProcess: () => starting,
		maxPendingCommands: 1,
	});
	const pending = host.execute(["open", "https://example.com/"]);
	await expect(
		host.execute(["open", "https://example.com/"]),
	).rejects.toMatchObject({ code: "resource-limit" });
	release(actor("default"));
	await pending;
});
