import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";
import type { SemanticSnapshot } from "./snapshot.js";

const hosts: BrowserCommandHost[] = [];
afterEach(async () => {
	for (const host of hosts.splice(0)) await host.close();
});

async function fixture() {
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) =>
					parseHtmlDocument(
						'<select id="field"><option>Alpha</option><option>Beta</option></select>',
						response.url,
					),
			}),
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/keys"]);
	const rows = () =>
		host.execute(["tab-list"]).then(
			(result) =>
				result.data as {
					key: string;
					documentRef: string;
					selected: boolean;
				}[],
		);
	const original = (await rows())[0];
	const guards = [
		`--expected-viewport=${original.key}`,
		`--expected-document=${original.documentRef}`,
	];
	const value = async () => {
		const snapshot = (await host.execute(["snapshot"]))
			.data as SemanticSnapshot;
		return snapshot.entries.find((entry) => entry.role === "combobox")?.value;
	};
	return { host, rows, original, guards, value };
}

it.each(["viewport", "document", "both"])(
	"accepts matching %s guards before targeted keys",
	async (guard) => {
		const { host, guards, value } = await fixture();
		await host.execute([
			"press",
			"--target=#field",
			...(guard === "both" ? guards : [guards[guard === "viewport" ? 0 : 1]]),
			"--",
			"ArrowDown",
		]);
		expect(await value()).toBe("Beta");
	},
);

it.each(["tab", "navigation", "session"])(
	"rejects replacement %s before resolving a target or dispatching a key",
	async (change) => {
		const { host, guards, value } = await fixture();
		if (change === "session") await host.execute(["close"]);
		await host.execute([
			change === "tab" ? "tab-new" : "open",
			"https://fixture.invalid/replacement",
		]);
		await expect(
			host.execute(["press", "--target=#field", ...guards, "ArrowDown"]),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(await value()).toBe("Alpha");
		await expect(
			host.execute(["press", "--target=#missing", ...guards, "ArrowDown"]),
		).rejects.toMatchObject({ code: "stale-reference" });
	},
);

it.each(["expected-viewport", "expected-document"])(
	"rejects a mismatched %s without input",
	async (flag) => {
		const { host, value } = await fixture();
		await expect(
			host.execute([
				"press",
				"--target=#field",
				`--${flag}=wrong-owner`,
				"ArrowDown",
			]),
		).rejects.toMatchObject({ code: "stale-reference" });
		expect(await value()).toBe("Alpha");
	},
);

it("checks ownership after preceding queued navigation completes", async () => {
	const { host, guards, value } = await fixture();
	const navigation = host.execute(["open", "https://fixture.invalid/queued"]);
	const action = host
		.execute(["press", "--target=#field", ...guards, "ArrowDown"])
		.then(
			() => undefined,
			(error: unknown) => error,
		);
	await navigation;
	expect(await action).toMatchObject({ code: "stale-reference" });
	expect(await value()).toBe("Alpha");
});

it("does not mistake resizing the same document for changing its owner", async () => {
	const { host, guards, value } = await fixture();
	await host.execute(["resize", "320", "240"]);
	await host.execute(["press", "--target=#field", ...guards, "ArrowDown"]);
	expect(await value()).toBe("Beta");
});

it("retains unguarded targeted and focused-key compatibility", async () => {
	const { host, value } = await fixture();
	await host.execute(["press", "--target=#field", "ArrowDown"]);
	expect(await value()).toBe("Beta");
	await host.execute(["press", "ArrowUp"]);
	expect(await value()).toBe("Alpha");
});

it("does not add ownership options to held-key commands", async () => {
	const { host, guards } = await fixture();
	for (const command of ["keydown", "keyup"])
		await expect(
			host.execute([command, ...guards, "ArrowDown"]),
		).rejects.toBeDefined();
});
