import { AgentBrowserError } from "./errors.js";

export const prepareStateReplacement = Symbol("prepareStateReplacement");

export interface StateReplacement {
	assertReady(): void;
	commit(): void;
}

export function stateRecord(input: unknown, fields: readonly string[]) {
	if (
		!input ||
		typeof input !== "object" ||
		Array.isArray(input) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
		Reflect.ownKeys(input).length !== fields.length
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid browser state record",
		);
	const result: Record<string, unknown> = Object.create(null);
	for (const field of fields) {
		const descriptor = Object.getOwnPropertyDescriptor(input, field);
		if (!descriptor || !("value" in descriptor))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid browser state field",
			);
		result[field] = descriptor.value;
	}
	return result;
}

export function* stateArray(input: unknown, limit: number): Generator<unknown> {
	if (!Array.isArray(input))
		throw new AgentBrowserError("invalid-input", "Invalid browser state array");
	if (input.length > limit)
		throw new AgentBrowserError(
			"resource-limit",
			"Storage state count limit exceeded",
		);
	if (Reflect.ownKeys(input).length !== input.length + 1)
		throw new AgentBrowserError("invalid-input", "Invalid browser state array");
	for (let index = 0; index < input.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
		if (!descriptor || !("value" in descriptor))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid browser state array entry",
			);
		yield descriptor.value;
	}
}
