import { runWhenActionable } from "./action-wait.js";
import { inputType } from "./controls.js";
import { AgentBrowserError } from "./errors.js";
import type { SecretBroker } from "./secret-providers.js";
import type { BrowserSession } from "./session.js";

const confidentialActions = new Set([
	"fill-secret",
	"fill",
	"type",
	"click",
	"press",
	"check",
	"uncheck",
	"select",
	"hover",
	"goto",
	"go-back",
	"go-forward",
	"reload",
]);

export function allowsConfidentialAction(command: string): boolean {
	return confidentialActions.has(command);
}

export function confidentialFailure() {
	return new AgentBrowserError(
		"policy-denied",
		"Confidential command did not complete; details withheld",
	);
}

export async function fillSecretCommand(
	browser: BrowserSession,
	target: string,
	reference: string,
	signal: AbortSignal,
	broker: SecretBroker | undefined,
	seal: () => void,
) {
	if (!broker) throw confidentialFailure();
	const tab = browser.tabs().find((candidate) => candidate.selected);
	if (!tab) throw confidentialFailure();
	await runWhenActionable(
		() => browser.page(tab.id),
		target,
		{ kind: "fill", value: "" },
		signal,
		async (page, resolved) => {
			const tree = page.document;
			const origin = new URL(tree.url).origin;
			const node = tree.resolve(resolved);
			if (
				node.tagName !== "input" ||
				inputType(node) !== "password" ||
				!broker.allows(reference, origin)
			)
				throw confidentialFailure();
			seal();
			await broker.use(reference, origin, signal, async (secret) => {
				if (
					signal.aborted ||
					browser.page(tab.id).document !== tree ||
					new URL(tree.url).origin !== origin ||
					inputType(tree.resolve(resolved)) !== "password"
				)
					throw confidentialFailure();
				await page.interactions.fillPasswordAsync(resolved, secret, signal);
			});
		},
	);
}
