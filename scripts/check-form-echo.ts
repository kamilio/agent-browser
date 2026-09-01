import {
	fillTextControl,
	selectControlValues,
	setControlChecked,
} from "../src/controls.js";
import { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { prepareFormSubmission } from "../src/forms.js";
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
		try {
			const form = tree.createElement("form", {
				action: "/post",
				method: "post",
				enctype,
			});
			tree.append(tree.root, form);
			const text = tree.createElement("input", { name: "probe" });
			tree.append(form, text);
			fillTextControl(tree, tree.reference(text), "agent-browser-validation");
			const checkbox = tree.createElement("input", {
				name: "enabled",
				type: "checkbox",
				value: "yes",
			});
			tree.append(form, checkbox);
			setControlChecked(tree, tree.reference(checkbox), true);
			const select = tree.createElement("select", {
				name: "choice",
				multiple: "",
			});
			tree.append(form, select);
			for (const value of ["one", "two"]) {
				const option = tree.createElement("option", { value });
				tree.append(select, option);
			}
			selectControlValues(tree, tree.reference(select), ["one", "two"]);
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
			checks.push({
				endpoint: "https://httpbingo.org/post",
				enctype,
				passed: result.status === 200 && valuesMatch && fileMatches,
				status: result.status,
				valuesMatch,
				fileMatches,
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
			schemaVersion: 1,
			scope: "form-serialization-and-transport-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			checks,
			allPassed,
			metrics: network.metrics(),
			limitations: [
				"Document trees are deliberately constructed fixtures, not parsed website HTML.",
				"No page JavaScript, browser navigation, submit events or constraint validation is exercised.",
				"Only non-sensitive demo fields are sent to a designated HTTP testing service; echoed client IPs and headers are not retained.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
