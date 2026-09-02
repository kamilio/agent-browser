import {
	controlChecked,
	inputType,
	isTextControl,
	prepareSelectControlValues,
	validateTextControl,
} from "./controls.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { SessionPage } from "./session.js";
import { resolveBrowserTarget } from "./target-locator.js";

export type WaitingAction =
	| { kind: "click" }
	| { kind: "fill"; value: string }
	| { kind: "select"; values: readonly string[] }
	| { kind: "checked"; checked: boolean };
export type ActionPage = Pick<
	SessionPage,
	"document" | "interactions" | "queries"
>;

function interrupted(signal: AbortSignal) {
	if (signal.aborted)
		throw signal.reason instanceof AgentBrowserError
			? signal.reason
			: new AgentBrowserError("aborted", "Action wait was aborted");
}

function pause(signal: AbortSignal, milliseconds: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const finish = () => {
			signal.removeEventListener("abort", abort);
			resolve();
		};
		const timer = setTimeout(finish, milliseconds);
		const abort = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			try {
				interrupted(signal);
			} catch (error) {
				reject(error);
			}
		};
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
	});
}

function ready(page: ActionPage, reference: string, action: WaitingAction) {
	const status = page.interactions.actionability(reference);
	const node = status.node;
	if (action.kind === "fill") {
		if (!isTextControl(node))
			throw new AgentBrowserError(
				"not-actionable",
				"Expected a text or number control",
			);
		if (status.blocked) return false;
		if (Object.hasOwn(node.attributes, "readonly")) return false;
		validateTextControl(page.document, reference, action.value);
	} else if (action.kind === "checked") {
		if (
			node.tagName !== "input" ||
			!["checkbox", "radio"].includes(inputType(node))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a checkbox/radio and boolean state",
			);
		if (
			inputType(node) === "radio" &&
			!action.checked &&
			controlChecked(page.document, node.id)
		)
			throw new AgentBrowserError(
				"not-actionable",
				"A radio cannot be unchecked by clicking it",
			);
		if (status.blocked) return false;
	} else if (action.kind === "select") {
		if (node.tagName !== "select")
			throw new AgentBrowserError(
				"not-actionable",
				"Expected a select control",
			);
		if (status.blocked) return false;
		try {
			prepareSelectControlValues(page.document, reference, action.values);
		} catch (error) {
			if (
				error instanceof AgentBrowserError &&
				["not-found", "not-actionable"].includes(error.code)
			)
				return false;
			throw error;
		}
	} else if (status.blocked) return false;
	return true;
}

export async function runWhenActionable<Result>(
	getPage: () => ActionPage,
	target: string,
	action: WaitingAction,
	signal: AbortSignal,
	perform: (page: ActionPage, reference: string) => Result | Promise<Result>,
	options: { intervalMs?: number; maxPolls?: number } = {},
): Promise<Result> {
	const interval = options.intervalMs ?? 25;
	const maxPolls = options.maxPolls ?? 2048;
	if (
		!(signal instanceof AbortSignal) ||
		!Number.isSafeInteger(interval) ||
		interval < 1 ||
		interval > 1000 ||
		!Number.isSafeInteger(maxPolls) ||
		maxPolls < 1 ||
		maxPolls > 10_000
	)
		throw new AgentBrowserError("invalid-input", "Invalid action wait limits");
	let previousDocument: DocumentTree | undefined;
	let previousRevision = -1;
	for (let poll = 0; poll < maxPolls; poll++) {
		interrupted(signal);
		const page = getPage();
		page.document.reference(page.document.root);
		const events = page.interactions.events.metrics();
		if (events.closed)
			throw new AgentBrowserError("closed", "Document interactions are closed");
		if (events.activeDispatches) {
			try {
				await page.interactions.events.whenIdle(signal);
			} catch (error) {
				interrupted(signal);
				throw error;
			}
			previousDocument = undefined;
			continue;
		}
		if (
			page.document !== previousDocument ||
			page.document.revision !== previousRevision
		) {
			previousDocument = page.document;
			previousRevision = page.document.revision;
			let reference: string | undefined;
			try {
				reference = resolveBrowserTarget(page.document, page.queries, target);
			} catch (error) {
				if (!(error instanceof AgentBrowserError) || error.code !== "not-found")
					throw error;
			}
			if (reference !== undefined && ready(page, reference, action)) {
				interrupted(signal);
				return perform(page, reference);
			}
		}
		await pause(signal, interval);
	}
	interrupted(signal);
	throw new AgentBrowserError(
		"resource-limit",
		"Action wait polling limit exceeded",
	);
}
