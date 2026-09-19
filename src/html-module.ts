import { types } from "node:util";
import type { FetchCredentials } from "./cors.js";
import type { DocumentScriptAdmission } from "./document-script-csp.js";
import { AgentBrowserError } from "./errors.js";

export interface HtmlModuleRequest {
	readonly id: string;
	readonly source?: string;
	readonly baseUrl: string;
	readonly credentials: FetchCredentials;
	readonly integrity?: string;
	readonly admission?: DocumentScriptAdmission;
	readonly signal: AbortSignal;
}

export interface HtmlModuleSource {
	readonly id: string;
	readonly source: string;
}

function invalidModuleInput(): AgentBrowserError {
	return new AgentBrowserError("invalid-input", "Invalid module input");
}

export function moduleInputData(
	record: unknown,
	key: string,
	optional = false,
): unknown {
	if (!record || typeof record !== "object" || types.isProxy(record))
		throw invalidModuleInput();
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	let inherited = false;
	let prototype: object | null = Object.getPrototypeOf(record);
	let depth = 0;
	while (prototype !== null) {
		if (types.isProxy(prototype) || depth++ >= 32) throw invalidModuleInput();
		if (!descriptor && Object.getOwnPropertyDescriptor(prototype, key))
			inherited = true;
		prototype = Object.getPrototypeOf(prototype);
	}
	if (!descriptor && optional && !inherited) return undefined;
	if (!descriptor || !("value" in descriptor)) throw invalidModuleInput();
	return descriptor.value;
}
