import { AgentBrowserError } from "./errors.js";
import type { DefaultActionIntent } from "./interactions.js";
import type { MouseResult } from "./mouse.js";

export type DoubleClickCount = 1 | 2;

export interface DoubleClickOptions {
	signal?: AbortSignal;
	checkOwnership?: () => void;
	afterClick?: (
		result: MouseResult,
		detail: DoubleClickCount,
	) => void | Promise<void>;
}

export interface DoubleClickResult {
	clicks: readonly MouseResult[];
	doubleClick?: MouseResult;
	pendingDefaultAction?: DefaultActionIntent;
	canceled: boolean;
}

export interface DoubleClickPhases {
	check: () => void;
	checkOwnership: () => void;
	click: (detail: DoubleClickCount) => Promise<MouseResult>;
	finish: () => Promise<MouseResult>;
}

export async function runDoubleClick(
	phases: DoubleClickPhases,
	options: DoubleClickOptions,
): Promise<DoubleClickResult> {
	const clicks: MouseResult[] = [];
	let canceled = false;
	for (const detail of [1, 2] as const) {
		phases.check();
		const result = await phases.click(detail);
		phases.checkOwnership();
		clicks.push(result);
		canceled ||= result.canceled;
		if (!result.interaction)
			throw new AgentBrowserError(
				"not-actionable",
				"Double-click target did not receive a click",
			);
		if (options.afterClick) {
			await completeClick(options.afterClick(result, detail), options.signal);
			phases.checkOwnership();
		} else if (result.defaultAction) {
			return { clicks, canceled, pendingDefaultAction: result.defaultAction };
		}
	}
	phases.check();
	const doubleClick = await phases.finish();
	phases.checkOwnership();
	return { clicks, doubleClick, canceled: canceled || doubleClick.canceled };
}

function completeClick(pending: void | Promise<void>, signal?: AbortSignal) {
	if (!signal) return pending;
	return new Promise<void>((resolve, reject) => {
		const abort = () => {
			signal.removeEventListener("abort", abort);
			reject(
				new AgentBrowserError("aborted", "Double-click default action aborted"),
			);
		};
		signal.addEventListener("abort", abort, { once: true });
		Promise.resolve(pending).then(
			() => {
				signal.removeEventListener("abort", abort);
				resolve();
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
		if (signal.aborted) abort();
	});
}
