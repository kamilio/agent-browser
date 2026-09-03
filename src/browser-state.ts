import type { CookieJar, CookieState } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import { prepareStateReplacement, stateRecord } from "./state-replacement.js";
import type { BrowserStorage, LocalStorageState } from "./storage.js";

export interface BrowserState extends CookieState, LocalStorageState {}

export interface BrowserStateOwner {
	readonly cookies: CookieJar;
	readonly storage: BrowserStorage;
}

export function exportBrowserState(owner: BrowserStateOwner): BrowserState {
	return {
		...owner.cookies.exportState(),
		...owner.storage.exportLocalState(),
	};
}

export function replaceBrowserState(
	owner: BrowserStateOwner,
	input: unknown,
): void {
	const state = stateRecord(input, ["schemaVersion", "cookies", "origins"]);
	if (state.schemaVersion !== 1)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid browser state schema",
		);
	const cookies = owner.cookies[prepareStateReplacement]({
		schemaVersion: 1,
		cookies: state.cookies,
	});
	const storage = owner.storage[prepareStateReplacement]({
		origins: state.origins,
	});
	cookies.assertReady();
	storage.assertReady();
	cookies.commit();
	storage.commit();
}
