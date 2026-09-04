import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import { PageBindings } from "./page-bindings.js";
import type { PageFocusOperation } from "./page-focus.js";

it.each([
	{ teardown: "document", registration: 1 },
	{ teardown: "document", registration: 4 },
	{ teardown: "runtime", registration: 1 },
	{ teardown: "runtime", registration: 4 },
])(
	"revokes focus operations when $teardown teardown reenters registration $registration",
	({ teardown, registration }) => {
		const document = new DocumentTree(
			"https://fixture.invalid/focus-lifecycle",
		);
		const interactions = documentInteractions(document);
		const registered: PageFocusOperation[] = [];
		let runtimeClosed = false;
		try {
			expect(
				() =>
					new PageBindings(
						{ document, interactions },
						{
							createHostObject: () => ({}),
							retainGuestArguments: (operation) => operation,
							releaseGuestReference() {},
							nestedOperation(operation) {
								registered.push(operation);
								if (registered.length === registration) {
									if (teardown === "document") document.close();
									else runtimeClosed = true;
								}
								return operation;
							},
						},
						{
							isClosed: () => runtimeClosed,
							startCallback() {
								throw new Error("No callback expected");
							},
							fail(error) {
								throw error;
							},
							onConsoleCall() {},
						},
						{ focusLimits: { maxBindings: 2 } },
					),
			).toThrow(/closed/);
			for (const operation of registered)
				expect(operation).toThrow("Page focus is closed");
			expect(registered).toHaveLength(registration);
		} finally {
			document.close();
		}
	},
);
