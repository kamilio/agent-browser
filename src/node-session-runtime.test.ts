import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	BrowserSessionProcess,
	type SessionProcessOptions,
} from "./node-session-process.js";

const boundary = vi.hoisted(() => ({
	spawn: vi.fn(),
	readRoot: vi.fn(async () => "/trusted/fixture"),
}));
vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("./node-process-boundary.js", async (original) => ({
	...(await original<typeof import("./node-process-boundary.js")>()),
	processReadRoot: boundary.readRoot,
}));

const permissions = {
	enabled: true,
	filesystemWrite: false,
	childProcess: false,
	worker: false,
	addons: false,
	wasi: false,
	stringCodeGenerationDisabled: true,
};
const actors: BrowserSessionProcess[] = [];

class FakeChild extends EventEmitter {
	readonly pid = 42123;
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly frames: Record<string, unknown>[] = [];
	readonly stdin = Object.assign(new EventEmitter(), {
		write: vi.fn((frame: string) => {
			const message = JSON.parse(frame);
			this.frames.push(message);
			if (message.type === "initialize") {
				queueMicrotask(() =>
					this.stdout.emit(
						"data",
						Buffer.from(
							`${JSON.stringify({
								schemaVersion: 1,
								type: "ready",
								pid: this.pid,
								session: message.session,
								version: "0.1.40-fixture",
								packageName: "@poe-platform/safe-js",
								runtimeAdapter: message.runtimeAdapter,
								runtimeValidation: "contract-shape-only",
								...(message.runtimeOptions
									? { runtimeOptions: message.runtimeOptions }
									: {}),
								publicExport: "./core",
								permissions,
								...this.reply,
							})}\n`,
						),
					),
				);
			}
			return true;
		}),
	});
	readonly kill = vi.fn((_signal: string) => {
		queueMicrotask(() => this.emit("close"));
		return true;
	});

	constructor(private readonly reply: Record<string, unknown> = {}) {
		super();
	}
}

beforeEach(() => {
	boundary.spawn.mockReset();
	boundary.readRoot.mockClear();
});
afterEach(async () => {
	for (const actor of actors.splice(0)) await actor.close();
});

async function fixture(
	options: Partial<SessionProcessOptions> = {},
	reply: Record<string, unknown> = {},
) {
	const child = new FakeChild(reply);
	boundary.spawn.mockReturnValue(child);
	const actor = await BrowserSessionProcess.create({
		packageRoot: "/trusted/fixture",
		session: "runtime",
		...options,
	});
	actors.push(actor);
	return { actor, child };
}

it("sends the legacy default and retains the restricted process launch boundary", async () => {
	const { actor, child } = await fixture();
	expect(child.frames[0]).toMatchObject({
		type: "initialize",
		packageRoot: "/trusted/fixture",
		session: "runtime",
		runtimeAdapter: "legacy",
	});
	expect(child.frames[0]).not.toHaveProperty("websiteScripts");
	expect(child.frames[0]).not.toHaveProperty("runtimeOptions");
	expect(actor.info()).not.toHaveProperty("runtimeOptions");
	expect(boundary.spawn).toHaveBeenCalledWith(
		process.execPath,
		expect.arrayContaining([
			"--permission",
			"--allow-fs-read=/trusted/fixture",
			"--disallow-code-generation-from-strings",
		]),
		{ cwd: "/trusted/fixture", env: {}, stdio: ["pipe", "pipe", "pipe"] },
	);
	expect(actor.info()).toMatchObject({
		runtimeAdapter: "legacy",
		runtimeValidation: "contract-shape-only",
		publicExport: "./core",
	});
});

it("forwards and echoes an immutable runtime snapshot without enabling the automatic loader", async () => {
	const runtimeOptions = {
		classicScripts: true,
		callbackScheduling: "after-prefix" as const,
	};
	const { actor, child } = await fixture({
		runtimeAdapter: "extension",
		runtimeOptions,
	});
	runtimeOptions.classicScripts = false;
	expect(child.frames[0].runtimeOptions).toEqual({
		classicScripts: true,
		callbackScheduling: "after-prefix",
	});
	expect(child.frames[0]).not.toHaveProperty("websiteScripts");
	expect(actor.info().runtimeOptions).toEqual(child.frames[0].runtimeOptions);
	expect(Object.isFrozen(actor.info().runtimeOptions)).toBe(true);
});

it("snapshots runtime settings before asynchronous root validation", async () => {
	let complete!: (root: string) => void;
	boundary.readRoot.mockImplementationOnce(
		() =>
			new Promise<string>((resolve) => {
				complete = resolve;
			}),
	);
	const child = new FakeChild();
	boundary.spawn.mockReturnValue(child);
	const options: SessionProcessOptions = {
		packageRoot: "/trusted/fixture",
		runtimeAdapter: "extension",
		runtimeOptions: { classicScripts: true },
	};
	const loading = BrowserSessionProcess.create(options);
	options.runtimeOptions = { classicScripts: false };
	options.runtimeAdapter = "legacy";
	complete("/trusted/fixture");
	const actor = await loading;
	actors.push(actor);
	expect(child.frames[0]).toMatchObject({
		runtimeAdapter: "extension",
		runtimeOptions: { classicScripts: true },
	});
});

it.each([
	[],
	null,
	{ classicScripts: "true" },
	{ callbackScheduling: "immediate" },
	{ moduleOptions: {} },
])(
	"rejects malformed runtime options before root access/spawn %#",
	async (runtimeOptions) => {
		await expect(
			BrowserSessionProcess.create({
				packageRoot: "/unused",
				runtimeAdapter: "extension",
				runtimeOptions,
			} as SessionProcessOptions),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(boundary.readRoot).not.toHaveBeenCalled();
		expect(boundary.spawn).not.toHaveBeenCalled();
	},
);

it("rejects legacy configuration and outer getters before spawning", async () => {
	await expect(
		BrowserSessionProcess.create({
			packageRoot: "/unused",
			runtimeOptions: { classicScripts: true },
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	const getter = vi.fn(() => ({ classicScripts: true }));
	const options = Object.defineProperty(
		{ packageRoot: "/unused", runtimeAdapter: "extension" },
		"runtimeOptions",
		{ get: getter },
	);
	await expect(
		BrowserSessionProcess.create(options as SessionProcessOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(getter).not.toHaveBeenCalled();
	expect(boundary.readRoot).not.toHaveBeenCalled();
	expect(boundary.spawn).not.toHaveBeenCalled();
});

it.each([
	undefined,
	{},
	[],
	{ classicScripts: false },
	{ classicScripts: true, callbackScheduling: "immediate" },
])(
	"rejects missing or mismatched ready configuration %#",
	async (runtimeOptions) => {
		const child = new FakeChild({ runtimeOptions });
		boundary.spawn.mockReturnValue(child);
		await expect(
			BrowserSessionProcess.create({
				packageRoot: "/trusted/fixture",
				runtimeAdapter: "extension",
				runtimeOptions: { classicScripts: true },
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
	},
);

it("rejects unexpected runtime activation in a default ready frame", async () => {
	await expect(
		fixture(
			{ runtimeAdapter: "extension" },
			{ runtimeOptions: { classicScripts: true } },
		),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it.each([
	{ classicScripts: false },
	{ callbackScheduling: "after-prefix" },
] as const)(
	"preserves individual serializable process options %#",
	async (runtimeOptions) => {
		const { actor, child } = await fixture({
			runtimeAdapter: "extension",
			runtimeOptions,
		});
		expect(child.frames[0].runtimeOptions).toEqual(runtimeOptions);
		expect(actor.info().runtimeOptions).toEqual(runtimeOptions);
	},
);

it("compares ready configuration independently of JSON field order", async () => {
	const { actor } = await fixture(
		{
			runtimeAdapter: "extension",
			runtimeOptions: {
				classicScripts: true,
				callbackScheduling: "after-prefix",
			},
		},
		{
			runtimeOptions: {
				callbackScheduling: "after-prefix",
				classicScripts: true,
			},
		},
	);
	expect(actor.info().runtimeOptions).toEqual({
		classicScripts: true,
		callbackScheduling: "after-prefix",
	});
});

it("rejects adapter accessors before root validation or spawn", async () => {
	const getter = vi.fn(() => "extension");
	const options = Object.defineProperty(
		{ packageRoot: "/unused" },
		"runtimeAdapter",
		{ enumerable: true, get: getter },
	);
	await expect(
		BrowserSessionProcess.create(options as SessionProcessOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(getter).not.toHaveBeenCalled();
	expect(boundary.readRoot).not.toHaveBeenCalled();
	expect(boundary.spawn).not.toHaveBeenCalled();
});

it("forwards explicit extension selection independently of classic script opt-in", async () => {
	const { actor, child } = await fixture({
		runtimeAdapter: "extension",
		websiteScripts: "classic",
		scripts: { limits: { maxSteps: 100 } },
	});
	expect(child.frames[0]).toMatchObject({
		runtimeAdapter: "extension",
		websiteScripts: "classic",
		scripts: { limits: { maxSteps: 100 } },
	});
	expect(actor.info()).toMatchObject({
		runtimeAdapter: "extension",
		packageName: "@poe-platform/safe-js",
		runtimeValidation: "contract-shape-only",
	});
});

it.each([
	["poe-code", "./safe-js"],
	["@poe-code/safe-js", "./core"],
	["@poe-platform/safe-js", "./core"],
])(
	"accepts truthful public-export metadata for %s",
	async (packageName, publicExport) => {
		const { actor } = await fixture(
			{ runtimeAdapter: "extension" },
			{ packageName, publicExport },
		);
		expect(actor.info()).toMatchObject({ packageName, publicExport });
		const copy = actor.info();
		copy.permissions.filesystemWrite = true;
		expect(actor.info().permissions.filesystemWrite).toBe(false);
	},
);

it.each([null, "auto", "", false, 1])(
	"rejects invalid adapter %s before root access and spawn",
	async (runtimeAdapter) => {
		await expect(
			BrowserSessionProcess.create({
				packageRoot: "/unused",
				runtimeAdapter,
			} as SessionProcessOptions),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(boundary.readRoot).not.toHaveBeenCalled();
		expect(boundary.spawn).not.toHaveBeenCalled();
	},
);

it.each([
	{ runtimeAdapter: "extension" },
	{ runtimeAdapter: undefined },
	{ runtimeValidation: "executed" },
	{ runtimeValidation: "configuration-only" },
	{ runtimeValidation: undefined },
	{ publicExport: "./safe-js" },
	{ publicExport: undefined },
	{ packageName: "unknown-sdk" },
	{ packageName: "poe-code", publicExport: "./core" },
	{ pid: 999 },
	{ session: "other" },
	{ version: "bad-version" },
	{ permissions: { ...permissions, childProcess: true } },
])("rejects mismatched ready metadata without retry: %j", async (reply) => {
	const child = new FakeChild(reply);
	boundary.spawn.mockReturnValue(child);
	await expect(
		BrowserSessionProcess.create({
			packageRoot: "/trusted/fixture",
			session: "runtime",
		}),
	).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(boundary.spawn).toHaveBeenCalledOnce();
	expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
});

it("rejects a legacy reply when extension was requested", async () => {
	const child = new FakeChild({ runtimeAdapter: "legacy" });
	boundary.spawn.mockReturnValue(child);
	await expect(
		BrowserSessionProcess.create({
			packageRoot: "/trusted/fixture",
			runtimeAdapter: "extension",
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(child.kill).toHaveBeenCalledOnce();
});

it("does not spawn for invalid website-script configuration", async () => {
	await expect(
		BrowserSessionProcess.create({
			packageRoot: "/trusted/fixture",
			runtimeAdapter: "extension",
			websiteScripts: "modules",
		} as unknown as SessionProcessOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(boundary.spawn).not.toHaveBeenCalled();
});
