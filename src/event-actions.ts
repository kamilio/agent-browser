import type { BrowserEvent, DocumentEvents } from "./events.js";

export interface EventDispatch {
	target: number;
	event: BrowserEvent;
}

export type EventAction<Result> = Generator<EventDispatch, Result, boolean>;

export function runEventAction<Result>(
	events: DocumentEvents,
	action: EventAction<Result>,
): Result {
	let step = action.next();
	while (!step.done) {
		let allowed: boolean;
		try {
			allowed = events.dispatchEvent(step.value.target, step.value.event);
		} catch (error) {
			step = action.throw(error);
			continue;
		}
		step = action.next(allowed);
	}
	return step.value;
}

export async function runEventActionAsync<Result>(
	events: DocumentEvents,
	action: EventAction<Result>,
): Promise<Result> {
	let step = action.next();
	while (!step.done) {
		let allowed: boolean;
		try {
			allowed = await events.dispatchEventAsync(
				step.value.target,
				step.value.event,
			);
		} catch (error) {
			step = action.throw(error);
			continue;
		}
		step = action.next(allowed);
	}
	return step.value;
}
