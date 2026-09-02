import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const session = process.env.PLAYGROUND_TEST_BROWSER_SESSION;
if (!session || !/^[a-f0-9-]{36}$/.test(session))
	throw new Error(
		"Set PLAYGROUND_TEST_BROWSER_SESSION to an already paired, task-owned watchable session",
	);
if (!process.env.AGENT_BROWSER_RUNTIME_DIR)
	throw new Error(
		"Set AGENT_BROWSER_RUNTIME_DIR to the isolated test service directory",
	);
const binary = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const startedAt = new Date().toISOString();
const scripting = process.env.PLAYGROUND_TEST_SCRIPTS === "classic";
const checks: { label: string; passed: boolean }[] = [];
let interrupted = false;

async function browser(argv: string[]) {
	try {
		const result = await execute("bun", ["run", "browser", ...argv], {
			encoding: "utf8",
			timeout: 40_000,
			maxBuffer: 4_194_304,
		});
		return JSON.parse(result.stdout).result;
	} catch (error) {
		const details = error as { stdout?: string; stderr?: string };
		if (
			/409|user.*control|human.*control/i.test(
				`${details.stdout} ${details.stderr}`,
			)
		)
			interrupted = true;
		throw new Error(
			interrupted
				? "human-control-handoff"
				: "watchable-browser-command-failed",
		);
	}
}

async function snapshot() {
	return (await browser([`-s=${session}`, "snapshot", "--format=aria"]))
		.snapshot as string;
}

async function expectUi(label: string, predicate: (text: string) => boolean) {
	const deadline = Date.now() + 35_000;
	while (Date.now() < deadline) {
		if (predicate(await snapshot())) {
			checks.push({ label, passed: true });
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	checks.push({ label, passed: false });
	throw new Error("ui-assertion-timeout");
}

async function click(selector: string) {
	await browser(["click", session as string, selector]);
}
async function fill(selector: string, value: string) {
	await browser(["fill", session as string, selector, value]);
}
async function cli(argv: string[]) {
	const result = await execute(
		process.execPath,
		[binary, "-s=playground-probe", ...argv, "--json"],
		{
			encoding: "utf8",
			timeout: 40_000,
			maxBuffer: 1_048_576,
		},
	);
	return JSON.parse(result.stdout);
}

try {
	await click('[data-view="text"]');
	await expectUi(
		"paired UI is connected and declares the configured JavaScript mode",
		(text) =>
			text.includes("Connected locally") &&
			text.includes(
				scripting
					? "Automatic classic JavaScript is enabled (partial)."
					: "Website JavaScript is disabled",
			),
	);
	await fill("#session-name", "playground-probe");
	await click("#session-apply");
	await expectUi(
		"switching session does not create a document",
		(text) => text.includes("playground-probe") && text.includes("No document"),
	);
	await click('[data-url="https://httpbingo.org/json"]');
	await expectUi(
		"real JSON navigation produces own-engine semantic text",
		(text) => text.includes("WonderWidgets") && text.includes("document ready"),
	);
	await click('[data-view="snapshot"]');
	await expectUi(
		"snapshot inspector exposes real references",
		(text) => text.includes("documentRef") && text.includes("WonderWidgets"),
	);
	await click('[data-view="metrics"]');
	await expectUi(
		"metrics inspector exposes actual resource counters",
		(text) => text.includes("encodedBytes") && text.includes("requests"),
	);
	await fill("#command", 'localstorage-set probe "synthetic value"');
	await click("#run-command");
	await expectUi(
		"quoted CLI input executes in the selected session",
		(text) =>
			text.includes("localstorage-set") && text.includes("document ready"),
	);
	const stored = await cli(["localstorage-get", "probe"]);
	checks.push({
		label: "separate CLI process sees the UI storage mutation",
		passed: stored.data.value === "synthetic value",
	});
	await cli(["goto", "https://www.rfc-editor.org/rfc/rfc9110.txt"]);
	await click('[data-view="text"]');
	await expectUi(
		"observer follows a separate CLI navigation to real RFC text",
		(text) => text.includes("rfc9110.txt") && text.includes("HTTP Semantics"),
	);
	await click("#back");
	await expectUi("UI back traverses to the actual JSON document", (text) =>
		(
			text
				.split('region "Semantic text view"')[1]
				?.split("\n      - form")[0] ?? ""
		).includes("WonderWidgets"),
	);
	await click("#forward");
	await expectUi("UI forward traverses to the actual RFC document", (text) =>
		(
			text
				.split('region "Semantic text view"')[1]
				?.split("\n      - form")[0] ?? ""
		).includes("HTTP Semantics"),
	);
	await click('[data-url="https://example.com/"]');
	await expectUi(
		"real parsed HTML appears with partial-parser and configured-script disclosure",
		(text) =>
			text.includes("heading") &&
			text.includes("Example Domain") &&
			text.includes(
				scripting
					? "HTML partial; automatic JS enabled (partial)"
					: "HTML partial; automatic JS off",
			),
	);
	await fill("#command", "goto https://httpbingo.org/xml");
	await click("#run-command");
	await expectUi(
		"unsupported XML rejection preserves the committed HTML document",
		(text) =>
			text.includes("unsupported") &&
			text.includes("example.com") &&
			text.includes("Example Domain"),
	);
	await click('[data-view="html"]');
	await expectUi(
		"HTML inspector displays live serialized markup as inert text",
		(text) =>
			text.includes('region "Live HTML inspector"') &&
			/<html(?:\s|>)/.test(text) &&
			text.includes("</html>") &&
			text.includes("Example Domain"),
	);
	if (scripting) {
		await cli([
			"eval",
			'console.log("UI console information"); console.error("UI console failure")',
		]);
		await click('[data-view="console"]');
		await expectUi(
			"Console inspector shows real messages generated in the shared page runtime",
			(text) =>
				text.includes("UI console information") &&
				text.includes("UI console failure"),
		);
		await click("#console-level");
		await browser(["press", session, "End"]);
		await browser(["press", session, "Enter"]);
		await expectUi(
			"Console severity selection filters out informational messages",
			(text) =>
				text.includes("UI console failure") &&
				!text.includes("UI console information"),
		);
		await cli([
			"eval",
			"console.clear(); console.error('<img src=x onerror=\"document.title=123\">')",
		]);
		await click("#refresh");
		await expectUi(
			"Console markup is rendered as text without changing the viewer document",
			(text) =>
				text.includes("<img src=x onerror=") &&
				text.includes('document "Agent Browser — Playground"') &&
				!text.includes("UI console failure"),
		);
	}
	if (process.env.PLAYGROUND_TEST_SCREENSHOT)
		await browser([
			`-s=${session}`,
			"screenshot",
			`--filename=${process.env.PLAYGROUND_TEST_SCREENSHOT}`,
		]);
	await click('[data-view="activity"]');
	await expectUi(
		"activity records command failures without claiming page console support",
		(text) => text.includes("ERROR") && text.includes("goto"),
	);
	await click("#new-tab");
	await expectUi(
		"new tab has no fabricated document",
		(text) =>
			text.includes("Following playground-probe · no document") &&
			text.includes("1 · Empty tab"),
	);
	await click("#close-tab");
	await click('[data-view="text"]');
	await expectUi(
		"closing the new tab restores the prior document",
		(text) =>
			text.includes("Example Domain") && text.includes("document ready"),
	);
	await click("#disconnect");
	await expectUi(
		"disconnect clears page state and disables actions",
		(text) =>
			text.includes("Not connected") &&
			text.includes('button "Go"') &&
			!text.includes("WonderWidgets") &&
			!text.includes("synthetic value"),
	);
	const remaining = await cli(["snapshot"]);
	checks.push({
		label: "disconnect leaves the CLI session alive",
		passed: remaining.data.entries.some((entry: { name: string }) =>
			entry.name.includes("Example Domain"),
		),
	});
} catch (error) {
	checks.push({
		label: error instanceof Error ? error.message : "probe-failed",
		passed: false,
	});
} finally {
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				engine: scripting
					? "browser-agent own partial-HTML/text/JSON engine; classic page JavaScript partial"
					: "browser-agent own partial-HTML/text/JSON engine; website JS disabled",
				htmlDownload:
					process.env.PLAYGROUND_TEST_DOWNLOADS === "unavailable"
						? "Not verified: operator-controlled watchable browser downloads are unavailable; policy was not changed"
						: "Not verified by this inspector probe",
				observerTestTool:
					"existing watchable browser service; not an engine dependency",
				prerequisites:
					"task-owned paired watchable session and isolated foreground service",
				lifecycle:
					"caller must close its watchable session and stop its service; never close on human-control handoff",
				humanControlHandoff: interrupted,
				checks,
			},
			null,
			2,
		),
	);
	if (checks.some((check) => !check.passed)) process.exitCode = 1;
}
