import { AgentBrowserError } from "./errors.js";
import { BrowserEvent } from "./events.js";

export class BrowserInputEvent extends BrowserEvent {
	readonly #data: string | null;
	readonly #inputType: string;
	constructor(
		type: string,
		data: string | null,
		inputType: string,
		cancelable = false,
	) {
		super(type, { bubbles: true, composed: true, cancelable });
		if (
			(data !== null && typeof data !== "string") ||
			typeof inputType !== "string" ||
			inputType.length > 256
		)
			throw new AgentBrowserError("invalid-input", "Invalid input event data");
		this.#data = data;
		this.#inputType = inputType;
	}
	get data() {
		return this.#data;
	}
	get inputType() {
		return this.#inputType;
	}
	get isComposing() {
		return false;
	}
}
