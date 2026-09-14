import { afterEach, expect, it, vi } from "vitest";
import { documentImages, type DocumentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import type { NetworkResponse } from "./network.js";
import { BrowserSession } from "./session.js";

const origin = "https://fixture.invalid";
const pageUrl = `${origin}/page`;
const imageUrl = `${origin}/uncaptured.svg`;
type Cancellation = "signal" | "stop" | "closeTab" | "close";
interface AbortFixture {
	session: BrowserSession;
	tab: string;
	controller: AbortController;
	requests: string[];
	release: () => void;
	state: () => {
		partial: DocumentTree | undefined;
		images: DocumentImages | undefined;
		closeNotifications: number;
		loaderFinished: boolean;
		active: number;
		transportClosed: boolean;
	};
}
const fixtures: AbortFixture[] = [];

function response(
	url: string,
	source: string,
	type = "text/html",
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(action: Cancellation, holdTransport = false): AbortFixture {
	const controller = new AbortController();
	const requests: string[] = [];
	let active = 0;
	let transportClosed = false;
	let partial: DocumentTree | undefined;
	let images: DocumentImages | undefined;
	let closeNotifications = 0;
	let loaderFinished = false;
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const session = new BrowserSession({
		createTransport: () => ({
			limits: Object.freeze({ maxConcurrent: 1 }),
			async request(request) {
				requests.push(request.url);
				active++;
				try {
					if (request.url === pageUrl)
						return response(
							pageUrl,
							"<!doctype html><style>main{width:10px;height:10px;background-image:url(/uncaptured.svg)}</style><main>Native fixture</main>",
						);
					if (request.url !== imageUrl || !partial)
						throw new Error("Unexpected native fixture request");
					images = documentImages(partial);
					const failure = new Error(
						"Uncaptured request denied before transport",
					);
					if (action === "signal") controller.abort(failure);
					else if (action === "close") session.close();
					else session[action](tab);
					if (holdTransport) await waiting;
					throw failure;
				} finally {
					active--;
				}
			},
			metrics: () => ({
				requests: requests.length,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				active,
				closed: transportClosed,
			}),
			close() {
				transportClosed = true;
			},
		}),
		loadDocument: async (result, context) => {
			try {
				return await loadBrowserDocument(result, {
					...context,
					initializeDocument(tree) {
						partial = tree;
						tree.onClose(() => {
							closeNotifications++;
						});
						context.initializeDocument?.(tree);
					},
				});
			} finally {
				loaderFinished = true;
			}
		},
	});
	const tab = session.createTab().id;
	const state = () => ({
		partial,
		images,
		closeNotifications,
		loaderFinished,
		active,
		transportClosed,
	});
	const current = { session, tab, controller, requests, release, state };
	fixtures.push(current);
	return current;
}

afterEach(async () => {
	for (const current of fixtures.splice(0)) {
		current.session.close();
		current.release();
		await vi.waitFor(
			() => {
				expect(current.session.metrics().pendingLoads).toBe(0);
				expect(current.session.metrics().requestQueue?.active).toBe(0);
				expect(current.state().active).toBe(0);
			},
			{ timeout: 1000, interval: 1 },
		);
	}
});

it.each(["signal", "stop", "closeTab", "close"] as const)(
	"settles real loader background cancellation after %s without a second request",
	async (action) => {
		const current = fixture(action);
		await expect(
			current.session.navigate(current.tab, pageUrl, {
				signal: current.controller.signal,
			}),
		).rejects.toMatchObject({
			code: action === "closeTab" || action === "close" ? "closed" : "aborted",
		});
		current.session.close();
		expect(current.session.metrics().closed).toBe(true);
		expect(current.session.metrics().pendingLoads).toBeLessThanOrEqual(1);
		await vi.waitFor(
			() => {
				expect(current.state().loaderFinished).toBe(true);
				expect(current.state().partial?.nodeCount).toBe(0);
				expect(current.state().images?.metrics()).toMatchObject({
					closed: true,
					active: 0,
					queued: 0,
					waiters: 0,
					resources: 0,
					decodedBytes: 0,
				});
				expect(current.session.metrics()).toMatchObject({
					closed: true,
					tabs: 0,
					pendingLoads: 0,
					commits: 0,
					cleanupErrors: 0,
					requestQueue: { closed: true, active: 0, pending: 0 },
					network: { closed: true, active: 0 },
				});
			},
			{ timeout: 1000, interval: 1 },
		);
		expect(current.state().closeNotifications).toBe(1);
		expect(current.requests).toEqual([pageUrl, imageUrl]);
	},
);

it("keeps an uncooperative background transport slot counted until actual settlement", async () => {
	const current = fixture("signal", true);
	await expect(
		current.session.navigate(current.tab, pageUrl, {
			signal: current.controller.signal,
		}),
	).rejects.toMatchObject({ code: "aborted" });
	current.session.close();
	await vi.waitFor(
		() => {
			expect(current.state().loaderFinished).toBe(true);
			expect(current.state().partial?.nodeCount).toBe(0);
			expect(current.session.metrics().pendingLoads).toBe(0);
		},
		{ timeout: 1000, interval: 1 },
	);
	expect(current.state().images?.metrics()).toMatchObject({
		closed: true,
		active: 0,
	});
	expect(current.session.metrics()).toMatchObject({
		closed: true,
		requestQueue: { closed: true, active: 1, pending: 0 },
		network: { closed: true, active: 1 },
	});
	current.release();
	await vi.waitFor(
		() => {
			expect(current.session.metrics().requestQueue?.active).toBe(0);
			expect(current.state().active).toBe(0);
		},
		{ timeout: 1000, interval: 1 },
	);
	expect(current.state().closeNotifications).toBe(1);
	expect(current.requests).toEqual([pageUrl, imageUrl]);
});
