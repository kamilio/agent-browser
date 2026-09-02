import {
	controlChecked,
	controlValue,
	selectedOptions,
} from "../src/controls.js";
import { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { prepareFormSubmission } from "../src/forms.js";
import { DocumentInteractions } from "../src/interactions.js";
import { decodeResponseText } from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";

const network = new NodeNetworkTransport({
	allowedOrigins: ["https://httpbingo.org"],
	limits: {
		maxRequests: 3,
		maxRequestBytes: 16_384,
		maxResponseBytes: 65_536,
		timeoutMs: 20_000,
	},
});
const checks: Record<string, unknown>[] = [];
const startedAt = new Date().toISOString();

try {
	for (const enctype of [
		"application/x-www-form-urlencoded",
		"multipart/form-data",
	]) {
		const tree = new DocumentTree("https://httpbingo.org/forms/post");
		const interactions = new DocumentInteractions(tree);
		const eventSequence: string[] = [];
		for (const type of ["beforeinput", "input", "click", "change", "reset"])
			interactions.events.addEventListener(tree.root, type, (event) => {
				eventSequence.push(event.type);
			});
		try {
			const form = tree.createElement("form", {
				action: "/post",
				method: "post",
				enctype,
			});
			tree.append(tree.root, form);
			const text = tree.createElement("input", { name: "probe" });
			tree.append(form, text);
			const eventResult = tree.createElement("input", {
				type: "hidden",
				name: "event_result",
				value: "unhandled",
			});
			tree.append(form, eventResult);
			interactions.events.addEventListener(text, "input", () =>
				tree.setControl(eventResult, { value: "input-handled" }),
			);
			interactions.fill(tree.reference(text), "agent-browser-validation");
			const checkbox = tree.createElement("input", {
				id: "enabled",
				name: "enabled",
				type: "checkbox",
				value: "yes",
			});
			tree.append(form, checkbox);
			const label = tree.createElement("label", { for: "enabled" });
			tree.append(form, label);
			const firstLabelActivation = interactions.click(tree.reference(label));
			const select = tree.createElement("select", {
				name: "choice",
				multiple: "",
			});
			tree.append(form, select);
			for (const value of ["one", "two"]) {
				const option = tree.createElement("option", { value });
				tree.append(select, option);
			}
			interactions.select(tree.reference(select), ["one", "two"]);
			const reset = interactions.forms.reset(tree.reference(form));
			const resetRestoredDefaults =
				reset.reset &&
				controlValue(tree, text) === "" &&
				controlValue(tree, eventResult) === "unhandled" &&
				!controlChecked(tree, checkbox) &&
				selectedOptions(tree, select).length === 0;
			interactions.fill(tree.reference(text), "agent-browser-validation");
			const secondLabelActivation = interactions.click(tree.reference(label));
			const labelActivationMatches =
				firstLabelActivation.label?.forwarded === true &&
				secondLabelActivation.label?.forwarded === true &&
				controlChecked(tree, checkbox);
			interactions.select(tree.reference(select), ["one", "two"]);
			const files = new Map<
				number,
				{ name: string; type: string; data: Uint8Array }[]
			>();
			if (enctype === "multipart/form-data") {
				const file = tree.createElement("input", {
					name: "upload",
					type: "file",
				});
				tree.append(form, file);
				files.set(file, [
					{
						name: "fixture.txt",
						type: "text/plain",
						data: new TextEncoder().encode("agent-browser-fixture"),
					},
				]);
			}
			const plan = prepareFormSubmission(tree, tree.reference(form), { files });
			const result = await network.request(plan.request);
			const response = JSON.parse(decodeResponseText(result).text) as {
				form?: Record<string, unknown>;
				files?: Record<string, unknown>;
			};
			const valuesMatch =
				!!response?.form &&
				JSON.stringify(response.form.probe) ===
					JSON.stringify(["agent-browser-validation"]) &&
				JSON.stringify(response.form.enabled) === JSON.stringify(["yes"]) &&
				JSON.stringify(response.form.choice) === JSON.stringify(["one", "two"]);
			const fileMatches =
				enctype !== "multipart/form-data" ||
				JSON.stringify(response?.files?.upload) ===
					JSON.stringify(["agent-browser-fixture"]);
			const echoedEventMutation =
				JSON.stringify(response?.form?.event_result) ===
				JSON.stringify(["input-handled"]);
			const eventSequenceMatches =
				JSON.stringify(eventSequence) ===
				JSON.stringify([
					"beforeinput",
					"input",
					"click",
					"change",
					"click",
					"input",
					"change",
					"input",
					"change",
					"reset",
					"beforeinput",
					"input",
					"click",
					"change",
					"click",
					"input",
					"change",
					"input",
					"change",
				]);
			const eventErrors = interactions.events.drainErrors().length;
			checks.push({
				endpoint: "https://httpbingo.org/post",
				enctype,
				passed:
					result.status === 200 &&
					valuesMatch &&
					fileMatches &&
					echoedEventMutation &&
					eventSequenceMatches &&
					resetRestoredDefaults &&
					labelActivationMatches &&
					eventErrors === 0,
				status: result.status,
				valuesMatch,
				fileMatches,
				echoedEventMutation,
				eventSequenceMatches,
				resetRestoredDefaults,
				labelActivationMatches,
				eventErrors,
				requestBytes:
					typeof plan.request.body === "string"
						? new TextEncoder().encode(plan.request.body).byteLength
						: (plan.request.body?.byteLength ?? 0),
				responseBytes: result.body.byteLength,
				elapsedMs: Math.round(result.elapsedMs),
				constructedDocument: true,
			});
		} catch (error) {
			checks.push({
				endpoint: "https://httpbingo.org/post",
				enctype,
				passed: false,
				error:
					error instanceof AgentBrowserError
						? { code: error.code, message: error.message }
						: { code: "unexpected-response" },
				constructedDocument: true,
			});
		} finally {
			tree.close();
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
} finally {
	network.close();
}

const allPassed = checks.every((check) => check.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 3,
			scope: "host-label-reset-control-form-transport-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			checks,
			allPassed,
			metrics: network.metrics(),
			limitations: [
				"Document trees are deliberately constructed fixtures, not parsed website HTML.",
				"No page JavaScript, browser navigation, submit events or constraint validation is exercised.",
				"Event handlers are trusted host fixture callbacks, not website code evaluated in a page runtime.",
				"File bytes are supplied explicitly after reset; intrinsic FileList reset is not implemented or tested.",
				"Only non-sensitive demo fields are sent to a designated HTTP testing service; echoed client IPs and headers are not retained.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
