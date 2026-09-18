import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	createPinnedPublicSuffixSnapshot,
	type PinnedPublicSuffixSnapshot,
} from "./pinned-public-suffix.js";
import { BrowserSession, type BrowserSessionOptions } from "./session.js";

let snapshot: PinnedPublicSuffixSnapshot;
const sessions: BrowserSession[] = [];
const firstUrl = "https://app.example.co.uk/start";
const childUrl = "https://client.example.co.uk/join";

beforeAll(async () => {
	snapshot = await createPinnedPublicSuffixSnapshot(
		readFileSync(
			new URL(
				"../vendor/public-suffix/public_suffix_list.dat",
				import.meta.url,
			),
		),
	);
});

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

function fixture(configuration: Record<string, unknown> = {}) {
	const selected: { url: string; cookie: string }[] = [];
	let transport: NodeNetworkTransport | undefined;
	const session = new BrowserSession({
		...configuration,
		createTransport(cookies) {
			const retrieve = cookies.cookieHeader.bind(cookies);
			cookies.cookieHeader = (url, context) => {
				const cookie = retrieve(url, context);
				selected.push({ url, cookie });
				return cookie;
			};
			transport = new NodeNetworkTransport({ cookieJar: cookies });
			const native = transport;
			return {
				request: (request: NetworkRequest) =>
					native.requestWithRoutes(request, (route) => {
						const response: NetworkResponse = {
							url: route.url,
							status: 200,
							headers:
								route.url === firstUrl
									? {
											"set-cookie": [
												"shared=synthetic; Domain=example.co.uk; Path=/; Secure; HttpOnly; SameSite=Strict",
												"local=synthetic; Path=/; Secure; SameSite=Strict",
											],
										}
									: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
						return response;
					}),
				metrics: () => native.metrics(),
				close: () => native.close(),
			};
		},
		loadDocument(response) {
			const tree = new DocumentTree(response.url);
			tree.append(tree.root, tree.createElement("body"));
			return tree;
		},
	} as BrowserSessionOptions);
	sessions.push(session);
	return { session, selected, transport: () => transport };
}

it("wires an explicit pinned cookie policy through native session navigation", async () => {
	const { session, selected, transport } = fixture({
		cookiePolicy: { publicSuffixSnapshot: snapshot },
	});
	const tab = session.createTab();
	await session.navigate(tab.id, firstUrl);
	await session.navigate(tab.id, childUrl);
	expect(selected).toEqual([
		{ url: firstUrl, cookie: "" },
		{ url: childUrl, cookie: "shared=synthetic" },
	]);
	expect(session.cookies.documentCookie(childUrl, childUrl)).toBe("");
	await session.navigate(tab.id, "https://example.co.uk.evil.com/");
	expect(selected.at(-1)?.cookie).toBe("");
	expect(transport()?.metrics()).toMatchObject({
		requests: 3,
		mockedRequests: 3,
		active: 0,
	});
	session.close();
	expect(session.cookies.metrics()).toMatchObject({ cookies: 0, closed: true });
	expect(transport()?.metrics().closed).toBe(true);
});

it("retains host-only cookie defaults when no session policy is selected", async () => {
	const { session, selected } = fixture();
	const tab = session.createTab();
	await session.navigate(tab.id, firstUrl);
	await session.navigate(tab.id, childUrl);
	expect(selected.map((request) => request.cookie)).toEqual(["", ""]);
	expect(session.cookies.metrics().rejections).toEqual({
		"domain-unsupported": 1,
	});
});

it("snapshots the selected session cookie policy before later caller mutation", async () => {
	const policy: { publicSuffixSnapshot?: PinnedPublicSuffixSnapshot } = {
		publicSuffixSnapshot: snapshot,
	};
	const configuration = { cookiePolicy: policy };
	const { session, selected } = fixture(configuration);
	policy.publicSuffixSnapshot = undefined;
	configuration.cookiePolicy = {};
	const tab = session.createTab();
	await session.navigate(tab.id, firstUrl);
	await session.navigate(tab.id, childUrl);
	expect(selected.at(-1)?.cookie).toBe("shared=synthetic");
});

it.each([null, false, "pinned", { publicSuffixSnapshot: {} }])(
	"rejects an invalid session cookie policy before creating transport: %j",
	(cookiePolicy) => {
		const createTransport = vi.fn();
		expect(
			() =>
				new BrowserSession({
					createTransport,
					loadDocument: () => new DocumentTree(firstUrl),
					cookiePolicy,
				} as unknown as BrowserSessionOptions),
		).toThrow(/cookie/i);
		expect(createTransport).not.toHaveBeenCalled();
	},
);

it("does not invoke accessor or inherited session cookie policy inputs", () => {
	const getter = vi.fn(() => ({ publicSuffixSnapshot: snapshot }));
	for (const inherited of [false, true]) {
		const createTransport = vi.fn();
		const policy = Object.defineProperty({}, "cookiePolicy", { get: getter });
		const options = Object.assign(inherited ? Object.create(policy) : policy, {
			createTransport,
			loadDocument: () => new DocumentTree(firstUrl),
		});
		expect(() => new BrowserSession(options)).toThrow(/cookie/i);
		expect(createTransport).not.toHaveBeenCalled();
	}
	expect(getter).not.toHaveBeenCalled();
});
