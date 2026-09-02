import { BrowserCommandHost } from "../src/command-host.js";
import { AgentBrowserError } from "../src/errors.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { BrowserSession, type SessionKeyResult } from "../src/session.js";
import { loadTextDocument } from "../src/text-loader.js";

const startedAt = new Date().toISOString();
const checks: Record<string, unknown>[] = [];
for (const encoding of [
	"application/x-www-form-urlencoded",
	"multipart/form-data",
]) {
	let ownedSession: BrowserSession | undefined;
	const host = new BrowserCommandHost({
		createSession: () => {
			ownedSession = new BrowserSession({
				createTransport: (cookieJar) =>
					new NodeNetworkTransport({
						cookieJar,
						allowedOrigins: ["https://httpbingo.org"],
						limits: {
							maxRequests: 3,
							maxRequestBytes: 16_384,
							maxResponseBytes: 65_536,
							timeoutMs: 20_000,
						},
					}),
				loadDocument: loadTextDocument,
			});
			return ownedSession;
		},
	});
	try {
		await host.execute(["open", "https://httpbingo.org/json"]);
		if (!ownedSession) throw new Error("Missing owned session");
		const tab = ownedSession.tabs()[0];
		const page = ownedSession.page(tab.id);
		const tree = page.document;
		const form = tree.createElement("form", {
			action: "/post",
			method: "post",
			enctype: encoding,
		});
		const field = tree.createElement("input", {
			id: "probe",
			name: "probe",
			required: "",
		});
		const button = tree.createElement("button", {
			name: "action",
			value: "keyboard",
		});
		tree.append(tree.root, form);
		tree.append(form, field);
		tree.append(form, button);
		const events: string[] = [];
		for (const type of [
			"keydown",
			"keypress",
			"keyup",
			"beforeinput",
			"input",
			"click",
			"submit",
		])
			page.interactions.events.addEventListener(form, type, (event) =>
				events.push(event.type),
			);
		let submittedWhileFocused = false;
		page.interactions.events.addEventListener(form, "submit", () => {
			submittedWhileFocused = page.interactions.focus.active() === field;
		});
		await host.execute(["click", "#probe"]);
		await host.execute(["type", "synthetic-wrong"]);
		await host.execute(["press", "Control+A"]);
		await host.execute(["type", "synthetic-🙂"]);
		await host.execute(["press", "Backspace"]);
		await host.execute(["type", "typed"]);
		const snapshot = await host.execute(["snapshot", "--json"]);
		const result = (await host.execute(["press", "Enter"]))
			.data as SessionKeyResult;
		const current = ownedSession.page(tab.id).document;
		const echoed = JSON.parse(current.textContent(current.root)) as {
			form?: Record<string, string[]>;
		};
		const valuesMatch =
			echoed.form?.probe?.[0] === "synthetic-typed" &&
			echoed.form?.action?.[0] === "keyboard";
		const keyOrderMatches =
			events.slice(-5).join(",") === "keydown,keypress,click,keyup,submit";
		const focusedSnapshot = JSON.stringify(snapshot.data).includes(
			'"focused":true',
		);
		checks.push({
			encoding,
			passed:
				result.navigation?.kind === "document" &&
				result.navigation.response?.status === 200 &&
				valuesMatch &&
				keyOrderMatches &&
				submittedWhileFocused &&
				focusedSnapshot,
			valuesMatch,
			keyOrderMatches,
			submittedWhileFocused,
			focusedSnapshot,
			eventCounts: Object.fromEntries(
				[
					"keydown",
					"keypress",
					"keyup",
					"beforeinput",
					"input",
					"click",
					"submit",
				].map((type) => [
					type,
					events.filter((observed) => observed === type).length,
				]),
			),
			response: result.navigation?.response,
			metrics: ownedSession.metrics(),
			rssBytes: process.memoryUsage().rss,
		});
	} catch (error) {
		checks.push({
			encoding,
			passed: false,
			error:
				error instanceof AgentBrowserError ? error.code : "unexpected-error",
		});
	} finally {
		host.close();
	}
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Constructed controls on real loaded JSON, not HTML parsing or website JavaScript. Actual command-host click/type/press, selection replacement, Unicode deletion and implicit Enter submission send public demo POSTs and load echo JSON. Separate-process CLI behavior is covered by local integration tests. No credentials or echoed headers are recorded.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
