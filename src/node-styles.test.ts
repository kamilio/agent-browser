import { type RequestListener, type Server, createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { NetworkRequest } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { renderSnapshot } from "./snapshot.js";

const sessions: BrowserSession[] = [];
const servers: Server[] = [];
const hosts: BrowserCommandHost[] = [];

afterEach(async () => {
	for (const host of hosts.splice(0)) host.close();
	for (const session of sessions.splice(0)) session.close();
	for (const server of servers.splice(0)) {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

it("denies HTTPS-to-HTTP stylesheet requests before calling the transport", async () => {
	const requests: NetworkRequest[] = [];
	const body = new TextEncoder().encode(
		"<link rel=stylesheet href=http://example.com/insecure.css><p>Secure document</p>",
	);
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (request) => {
				requests.push(request);
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				redirects: 0,
				encodedBytes: body.length,
				decodedBytes: body.length,
				active: 0,
				closed: false,
			}),
			close: () => {},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	const navigation = await session.navigate(tab.id, "https://example.com/");
	expect(requests).toHaveLength(1);
	expect(navigation.styles).toMatchObject({
		issues: { "stylesheet-policy-denied": 1 },
	});
});

async function fixture(handler: RequestListener) {
	const requests: { url: string; cookie?: string; accept?: string }[] = [];
	const server = createServer((request, response) => {
		requests.push({
			url: request.url ?? "",
			cookie: request.headers.cookie,
			accept: request.headers.accept,
		});
		handler(request, response);
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing address");
	const origin = `http://127.0.0.1:${address.port}`;
	const session = new BrowserSession({
		createTransport: (cookieJar) =>
			new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [origin] }),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	return { session, tab, requests, origin };
}

it("loads base-relative CSS through redirects and cookies and applies it to actual HTML", async () => {
	const { session, tab, requests, origin } = await fixture(
		(request, response) => {
			if (request.url === "/") {
				response.setHeader("content-type", "text/html");
				response.setHeader(
					"set-cookie",
					"fixture=synthetic; Path=/; SameSite=Lax",
				);
				response.end(
					'<base href="/assets/"><link rel=stylesheet href=start.css><button id=hidden>Hidden target</button><p>Visible target</p><script src=/never.js></script>',
				);
			} else if (request.url === "/assets/start.css") {
				response.writeHead(302, { location: "/assets/final.css" });
				response.end();
			} else {
				response.setHeader("content-type", "text/css; charset=utf-8");
				response.end(
					'@import "/never.css"; @font-face {src:url(/never.woff)} #hidden {display:none} p {background:url(/never.png)}',
				);
			}
		},
	);
	const navigation = await session.navigate(tab.id, origin);
	expect(navigation.styles).toMatchObject({
		externalSheets: 1,
		partial: true,
		layout: false,
	});
	expect(requests.map((request) => request.url)).toEqual([
		"/",
		"/assets/start.css",
		"/assets/final.css",
	]);
	expect(requests[1]).toMatchObject({
		cookie: "fixture=synthetic",
		accept: "text/css",
	});
	expect(requests[2].cookie).toBe("fixture=synthetic");
	const text = renderSnapshot(session.snapshot(tab.id));
	expect(text).toContain("Visible target");
	expect(text).not.toContain("Hidden target");
	const page = session.page(tab.id);
	const hidden = page.queries.querySelector("#hidden");
	if (hidden === null) throw new Error("Missing target");
	await expect(
		session.click(tab.id, page.document.reference(hidden)),
	).rejects.toMatchObject({ code: "not-actionable" });
});

it("reports bad MIME, HTTP failure and unsupported integrity without hiding usable HTML", async () => {
	const { session, tab, requests, origin } = await fixture(
		(request, response) => {
			response.setHeader("content-type", "text/html");
			if (request.url === "/")
				response.end(
					"<link rel=stylesheet href=/wrong><link rel=stylesheet href=/missing><link rel=stylesheet href=/integrity integrity=sha256-synthetic><link rel=stylesheet href=/cors crossorigin><h1>Usable page</h1>",
				);
			else if (request.url === "/missing") {
				response.statusCode = 404;
				response.end("missing");
			} else response.end("h1{display:none}");
		},
	);
	const navigation = await session.navigate(tab.id, origin);
	expect(navigation.styles).toMatchObject({
		externalSheets: 0,
		issues: {
			"stylesheet-unsupported": 2,
			"stylesheet-integrity-or-cors-not-implemented": 2,
		},
	});
	expect(requests.map((request) => request.url)).toEqual([
		"/",
		"/wrong",
		"/missing",
	]);
	expect(renderSnapshot(session.snapshot(tab.id))).toContain("Usable page");
});

it("limits document stylesheet requests to eight before starting a ninth request", async () => {
	const { session, tab, requests, origin } = await fixture(
		(request, response) => {
			if (request.url === "/") {
				response.setHeader("content-type", "text/html");
				response.end(
					`${Array.from({ length: 12 }, (_, index) => `<link rel=stylesheet href=/sheet-${index}.css>`).join("")}<p>Bounded page</p>`,
				);
			} else {
				response.setHeader("content-type", "text/css");
				response.end("p{display:block}");
			}
		},
	);
	const navigation = await session.navigate(tab.id, origin);
	expect(requests).toHaveLength(9);
	expect(navigation.styles).toMatchObject({
		externalSheets: 8,
		issues: { "stylesheet-resource-limit": 1 },
	});
});

it("does not grant a stylesheet access to an unallowlisted private origin", async () => {
	let forbiddenRequests = 0;
	const forbidden = await fixture((_request, response) => {
		forbiddenRequests++;
		response.end("h1{display:none}");
	});
	const { session, tab, origin } = await fixture((_request, response) => {
		response.setHeader("content-type", "text/html");
		response.end(
			`<link rel=stylesheet href="${forbidden.origin}/secret"><h1>Policy survives</h1>`,
		);
	});
	const navigation = await session.navigate(tab.id, origin);
	expect(forbiddenRequests).toBe(0);
	expect(navigation.styles).toMatchObject({
		issues: { "stylesheet-policy-denied": 1 },
	});
	expect(renderSnapshot(session.snapshot(tab.id))).toContain("Policy survives");
});

it("abandons an in-flight stylesheet when a newer navigation wins", async () => {
	let started!: () => void;
	const pending = new Promise<void>((resolve) => {
		started = resolve;
	});
	const { session, tab, requests, origin } = await fixture(
		(request, response) => {
			response.setHeader("content-type", "text/html");
			if (request.url === "/slow")
				response.end(
					"<link rel=stylesheet href=/pending><h1>Old candidate</h1>",
				);
			else if (request.url === "/pending") started();
			else response.end("<h1>New winner</h1>");
		},
	);
	const abandoned = session.navigate(tab.id, `${origin}/slow`);
	const rejected = expect(abandoned).rejects.toMatchObject({ code: "aborted" });
	await pending;
	await session.navigate(tab.id, `${origin}/winner`);
	await rejected;
	expect(requests.map((request) => request.url)).toEqual([
		"/slow",
		"/pending",
		"/winner",
	]);
	expect(session.page(tab.id).document.url).toBe(`${origin}/winner`);
	expect(renderSnapshot(session.snapshot(tab.id))).not.toContain(
		"Old candidate",
	);
});

it("persists viewport per tab across reload and exposes resize/styles through the command host", async () => {
	const { session, tab, origin } = await fixture((_request, response) => {
		response.setHeader("content-type", "text/html");
		response.end(
			"<style>@media (max-width:600px){#target{display:none}}</style><button id=target>Wide target</button>",
		);
	});
	session.resize(tab.id, 400, 800);
	await session.navigate(tab.id, origin);
	expect(renderSnapshot(session.snapshot(tab.id))).not.toContain("Wide target");
	await session.reload(tab.id);
	expect(session.page(tab.id).styles.metrics().viewport).toEqual({
		width: 400,
		height: 800,
	});
	const other = session.createTab();
	await session.navigate(other.id, origin);
	expect(renderSnapshot(session.snapshot(other.id))).toContain("Wide target");
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", origin]);
	await host.execute(["resize", "500", "800"]);
	expect((await host.execute(["styles", "#target"])).data).toMatchObject({
		display: "none",
		visible: false,
		layout: false,
	});
	await host.execute(["resize", "1000", "800"]);
	expect((await host.execute(["styles", "#target"])).data).toMatchObject({
		display: "inline",
		visible: true,
	});
	await expect(host.execute(["resize", "-1", "800"])).rejects.toMatchObject({
		code: "invalid-input",
	});
});

it("preserves the committed document when CSS exceeds its parsing budget", async () => {
	const { session, tab, origin } = await fixture((request, response) => {
		response.setHeader("content-type", "text/html");
		response.end(
			request.url === "/bad"
				? `<style>${"p{display:none}".repeat(4097)}</style><p>Candidate</p>`
				: "<h1>Committed</h1>",
		);
	});
	await session.navigate(tab.id, origin);
	const previous = session.page(tab.id).document;
	await expect(session.navigate(tab.id, `${origin}/bad`)).rejects.toMatchObject(
		{ code: "resource-limit" },
	);
	expect(session.page(tab.id).document).toBe(previous);
	expect(renderSnapshot(session.snapshot(tab.id))).toContain("Committed");
});
