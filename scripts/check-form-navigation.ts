import { AgentBrowserError } from "../src/errors.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { BrowserSession, type NavigationResult } from "../src/session.js";
import { loadTextDocument } from "../src/text-loader.js";

const startedAt = new Date().toISOString();
const checks: Record<string, unknown>[] = [];
for (const encoding of [
	"application/x-www-form-urlencoded",
	"multipart/form-data",
]) {
	const session = new BrowserSession({
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
	try {
		const tab = session.createTab();
		await session.navigate(tab.id, "https://httpbingo.org/json");
		const page = session.page(tab.id);
		const tree = page.document;
		const form = tree.createElement("form", {
			action: "/post",
			method: "post",
			enctype: encoding,
		});
		const field = tree.createElement("input", { name: "probe", required: "" });
		const button = tree.createElement("button", {
			name: "action",
			value: "send",
		});
		tree.append(tree.root, form);
		tree.append(form, field);
		tree.append(form, button);
		page.interactions.fill(tree.reference(field), "synthetic");
		let submits = 0;
		page.interactions.events.addEventListener(form, "submit", () => {
			submits++;
			tree.setControl(field, { value: "synthetic-event-value" });
		});
		let navigation: NavigationResult | undefined;
		if (encoding === "multipart/form-data") {
			const file = tree.createElement("input", {
				name: "upload",
				type: "file",
				required: "",
			});
			tree.append(form, file);
			navigation = (
				await session.requestSubmit(tab.id, tree.reference(form), {
					submitter: tree.reference(button),
					files: new Map([
						[
							file,
							[
								{
									name: "probe.txt",
									type: "text/plain",
									data: new TextEncoder().encode("synthetic file contents"),
								},
							],
						],
					]),
				})
			).navigation;
		} else
			navigation = (await session.click(tab.id, tree.reference(button)))
				.navigation;
		const current = session.page(tab.id).document;
		const echoed = JSON.parse(current.textContent(current.root)) as {
			form?: Record<string, string[]>;
			files?: Record<string, string[]>;
		};
		const valuesMatch =
			echoed.form?.probe?.[0] === "synthetic-event-value" &&
			echoed.form?.action?.[0] === "send";
		const fileMatches =
			encoding !== "multipart/form-data" ||
			echoed.files?.upload?.[0] === "synthetic file contents";
		let replayPrevented = false;
		try {
			await session.reload(tab.id);
		} catch (error) {
			replayPrevented =
				error instanceof AgentBrowserError && error.code === "unsupported";
		}
		checks.push({
			encoding,
			passed:
				navigation?.kind === "document" &&
				navigation.response?.status === 200 &&
				valuesMatch &&
				fileMatches &&
				submits === 1 &&
				tree.nodeCount === 0 &&
				replayPrevented,
			valuesMatch,
			fileMatches,
			submitEvents: submits,
			oldDocumentClosed: tree.nodeCount === 0,
			replayPrevented,
			response: navigation?.response,
			metrics: session.metrics(),
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
		session.close();
	}
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Constructed form controls added to real loaded JSON; host listeners, not website JavaScript. Session click/requestSubmit performs actual POST navigation and loads echo JSON. No HTML parsing or full-site form compatibility claimed.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
