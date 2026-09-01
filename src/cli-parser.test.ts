import { expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { commands } from "./commands.js";

it("preserves Playwright-style named session, reference and option conventions", () => {
	expect(
		parseInvocation([
			"-s=research",
			"open",
			"https://example.com",
			"--persistent",
		]),
	).toMatchObject({
		command: "open",
		session: "research",
		arguments: ["https://example.com"],
		options: { persistent: true },
	});
	expect(
		parseInvocation(["fill", "e15", "hello world", "--submit"]),
	).toMatchObject({
		command: "fill",
		arguments: ["e15", "hello world"],
		options: { submit: true },
	});
	expect(
		parseInvocation(["click", "getByRole('button', { name: 'Save' })"]),
	).toMatchObject({ arguments: ["getByRole('button', { name: 'Save' })"] });
});

it("supports global options before commands and additive agent output controls", () => {
	expect(
		parseInvocation([
			"--config",
			"browser.json",
			"--json",
			"snapshot",
			"e8",
			"--depth=4",
			"--boxes",
			"--diff",
			"--max-bytes=4096",
		]),
	).toMatchObject({
		command: "snapshot",
		arguments: ["e8"],
		options: {
			config: "browser.json",
			json: true,
			depth: 4,
			boxes: true,
			diff: true,
			"max-bytes": 4096,
		},
	});
});

it("keeps negative coordinates and literal option-looking text as data", () => {
	expect(parseInvocation(["mousewheel", "0", "-100"]).arguments).toEqual([
		"0",
		"-100",
	]);
	expect(parseInvocation(["fill", "e1", "--", "--help"]).arguments).toEqual([
		"e1",
		"--help",
	]);
	expect(parseInvocation(["type", ""]).arguments).toEqual([""]);
	expect(
		parseInvocation(["goto", "https://example.com/?a=1&b=2"]).arguments,
	).toEqual(["https://example.com/?a=1&b=2"]);
});

it("uses explicit session before our environment before the compatibility environment", () => {
	const environment = {
		AGENT_BROWSER_SESSION: "agent",
		PLAYWRIGHT_CLI_SESSION: "compat",
	};
	expect(parseInvocation(["snapshot"], environment).session).toBe("agent");
	expect(
		parseInvocation(["-s", "chosen", "snapshot"], environment).session,
	).toBe("chosen");
	expect(
		parseInvocation(["snapshot"], { PLAYWRIGHT_CLI_SESSION: "compat" }).session,
	).toBe("compat");
	expect(parseInvocation(["snapshot"]).session).toBe("default");
});

it("supports repeated drop values without losing their types or ordering", () => {
	expect(
		parseInvocation([
			"drop",
			"e1",
			"--path=one.txt",
			"--path=two.txt",
			"--data=text/plain=hello",
		]).options,
	).toEqual({ path: ["one.txt", "two.txt"], data: ["text/plain=hello"] });
	expect(
		parseInvocation(["open", "--persistent=false"]).options.persistent,
	).toBe(false);
});

it.each([
	["unknown"],
	["click"],
	["close", "extra"],
	["snapshot", "--made-up"],
	["snapshot", "--depth=NaN"],
	["snapshot", "--depth=0"],
	["snapshot", "--depth=1.5"],
	["snapshot", "--depth=1000001"],
	["snapshot", "--filename"],
	["snapshot", "--filename", "--json"],
	["snapshot", "--json=maybe"],
	["-s=one", "snapshot", "--session=two"],
	["-s=../../private", "snapshot"],
	["snapshot", "--json", "--json"],
	["snapshot", "--__proto__=value"],
	["snapshot", "--constructor=value"],
	["run-code"],
	["run-code", "() => 1", "--filename=code.ts"],
	["batch"],
	["drop", "e1"],
	["highlight"],
])("rejects invalid input without running anything: %j", (...argv) => {
	expect(() => parseInvocation(argv)).toThrow();
});

it("allows discovery without required action arguments and rejects oversized argv", () => {
	expect(parseInvocation([]).command).toBe("help");
	expect(parseInvocation(["click", "--help"]).options.help).toBe(true);
	expect(parseInvocation(["--version"]).options.version).toBe(true);
	expect(() => parseInvocation(["type", "x".repeat(262_145)])).toThrow(
		"too large",
	);
	expect(() => parseInvocation(Array.from({ length: 257 }, () => "x"))).toThrow(
		"too large",
	);
});

it("keeps the researched command families and additive commands in one registry", () => {
	for (const name of [
		"open",
		"click",
		"fill",
		"eval",
		"run-code",
		"snapshot",
		"find",
		"screenshot",
		"pdf",
		"tab-select",
		"cookie-set",
		"localstorage-get",
		"sessionstorage-set",
		"route",
		"requests",
		"tracing-start",
		"video-chapter",
		"show",
		"highlight",
		"attach",
		"delete-data",
		"install",
	])
		expect(commands.get(name)?.category).toBe("baseline");
	for (const name of [
		"capabilities",
		"metrics",
		"extract",
		"batch",
		"subscribe",
		"playground",
	])
		expect(commands.get(name)?.category).toBe("extension");
});
