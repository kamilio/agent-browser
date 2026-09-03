import { BrowserEvent } from "./events.js";

export class BrowserMediaQueryListEvent extends BrowserEvent {
	constructor(
		readonly media: string,
		readonly matches: boolean,
	) {
		super("change");
		Object.freeze(this);
	}
}
