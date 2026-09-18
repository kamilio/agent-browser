import { expect, it, vi } from "vitest";

const selected = {
	AGENT_BROWSER_SAFEJS_ROOT: "/trusted/fixture",
	AGENT_BROWSER_PAGE_RUNTIME: "extension",
};

it("keeps absent selections empty and immutable without requiring an SDK", async () => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	for (const environment of [
		{},
		{
			AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: undefined,
			AGENT_BROWSER_COMMAND_TIMEOUT_MS: undefined,
		},
		Object.create(null),
	]) {
		const configuration = scriptProfileFromEnvironment(environment);
		expect(configuration).toEqual({});
		expect(Object.isFrozen(configuration)).toBe(true);
	}
});

it.each(["bounded-v1", "large-source-v1", "application-v1"])(
	"selects %s without enabling scripting or raising any watchdog",
	async (budgetProfile) => {
		const { scriptProfileFromEnvironment } = await import(
			"./node-script-profile.js"
		);
		const environment = {
			...selected,
			AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: budgetProfile,
		};
		const configuration = scriptProfileFromEnvironment(environment);
		expect(configuration).toEqual({ scripts: { budgetProfile } });
		expect(Object.isFrozen(configuration)).toBe(true);
		expect(Object.isFrozen(configuration.scripts)).toBe(true);
		environment.AGENT_BROWSER_SCRIPT_BUDGET_PROFILE = "invalid-later";
		expect(configuration.scripts?.budgetProfile).toBe(budgetProfile);
	},
);

it.each(["20", "30000", "120000", "300000"])(
	"selects command timeout %s independently of adapter and profile",
	async (setting) => {
		const { scriptProfileFromEnvironment } = await import(
			"./node-script-profile.js"
		);
		for (const adapter of [undefined, "legacy", "extension"]) {
			expect(
				scriptProfileFromEnvironment({
					...selected,
					AGENT_BROWSER_PAGE_RUNTIME: adapter,
					AGENT_BROWSER_COMMAND_TIMEOUT_MS: setting,
				}),
			).toEqual({ commandTimeoutMs: Number(setting) });
		}
	},
);

it("snapshots independently selected profile and timeout", async () => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	const environment = {
		...selected,
		AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: "application-v1",
		AGENT_BROWSER_COMMAND_TIMEOUT_MS: "120000",
	};
	const configuration = scriptProfileFromEnvironment(environment);
	environment.AGENT_BROWSER_COMMAND_TIMEOUT_MS = "300000";
	expect(configuration).toEqual({
		scripts: { budgetProfile: "application-v1" },
		commandTimeoutMs: 120000,
	});
});

it.each([
	"",
	"auto",
	"application",
	"application-v1 ",
	"APPLICATION-V1",
	1,
	false,
	null,
	{},
	[],
	Object("application-v1"),
])("rejects malformed budget profile %#", async (profile) => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	expect(() =>
		scriptProfileFromEnvironment({
			...selected,
			AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: profile,
		}),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"",
	"0",
	"19",
	"300001",
	"9999999999999999999999",
	"Infinity",
	"NaN",
	"20.0",
	"2e1",
	"+20",
	"-20",
	"020",
	"0x20",
	" 20",
	"20 ",
	"20\n",
	20,
	false,
	null,
	{},
	[],
	Object("20"),
])("rejects malformed or out-of-range command timeout %#", async (setting) => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	expect(() =>
		scriptProfileFromEnvironment({
			...selected,
			AGENT_BROWSER_COMMAND_TIMEOUT_MS: setting,
		}),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"AGENT_BROWSER_SCRIPT_BUDGET_PROFILE",
	"AGENT_BROWSER_COMMAND_TIMEOUT_MS",
])("requires an explicit SDK root for %s", async (key) => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	for (const root of [undefined, "", false, null, {}]) {
		expect(() =>
			scriptProfileFromEnvironment({
				...selected,
				[key]: key.includes("TIMEOUT") ? "20" : "application-v1",
				AGENT_BROWSER_SAFEJS_ROOT: root,
			}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	}
});

it.each([undefined, "legacy"])(
	"requires explicit extension for a budget profile with adapter %s",
	async (adapter) => {
		const { scriptProfileFromEnvironment } = await import(
			"./node-script-profile.js"
		);
		expect(() =>
			scriptProfileFromEnvironment({
				...selected,
				AGENT_BROWSER_PAGE_RUNTIME: adapter,
				AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: "bounded-v1",
			}),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
	},
);

it("rejects reader profile conflicts before SDK requirements", async () => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	expect(() =>
		scriptProfileFromEnvironment({
			AGENT_BROWSER_DOCUMENT_PROFILE: "reader",
			AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: "application-v1",
		}),
	).toThrowError(
		expect.objectContaining({
			code: "invalid-input",
			message: expect.stringContaining("Reader document profile"),
		}),
	);
});

it.each([
	"AGENT_BROWSER_SCRIPT_BUDGET_PROFILE",
	"AGENT_BROWSER_COMMAND_TIMEOUT_MS",
	"AGENT_BROWSER_SAFEJS_ROOT",
	"AGENT_BROWSER_PAGE_RUNTIME",
	"AGENT_BROWSER_DOCUMENT_PROFILE",
])(
	"rejects inherited, hidden, and accessor %s without executing code",
	async (key) => {
		const { scriptProfileFromEnvironment } = await import(
			"./node-script-profile.js"
		);
		const base: Record<string, unknown> = {
			...selected,
			AGENT_BROWSER_SCRIPT_BUDGET_PROFILE: "application-v1",
			AGENT_BROWSER_COMMAND_TIMEOUT_MS: "20",
		};
		const value = base[key];
		delete base[key];
		const getter = vi.fn(() => value);
		for (const environment of [
			Object.defineProperty({ ...base }, key, {
				get: getter,
				enumerable: true,
			}),
			Object.assign(Object.create({ [key]: value }), base),
			Object.defineProperty({ ...base }, key, { value }),
		]) {
			expect(() => scriptProfileFromEnvironment(environment)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(getter).not.toHaveBeenCalled();
	},
);

it("never coerces hostile timeout or profile objects", async () => {
	const { scriptProfileFromEnvironment } = await import(
		"./node-script-profile.js"
	);
	const conversion = vi.fn(() => "20");
	const value = {
		toString: conversion,
		valueOf: conversion,
		[Symbol.toPrimitive]: conversion,
	};
	for (const key of [
		"AGENT_BROWSER_SCRIPT_BUDGET_PROFILE",
		"AGENT_BROWSER_COMMAND_TIMEOUT_MS",
	])
		expect(() =>
			scriptProfileFromEnvironment({ ...selected, [key]: value }),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(conversion).not.toHaveBeenCalled();
});

it.each([null, undefined, false, "settings", []])(
	"rejects non-record environment %#",
	async (environment) => {
		const { scriptProfileFromEnvironment } = await import(
			"./node-script-profile.js"
		);
		expect(() => scriptProfileFromEnvironment(environment)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);
