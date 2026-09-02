import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

let origin = "";
const sessions: BrowserSession[] = [];
const server = createServer((request, response) => {
	if (request.url === "/redirect") {
		response.writeHead(302, {
			location: "/json",
			"set-cookie": "fixture=session; Path=/; HttpOnly",
		});
		response.end();
	} else if (request.url === "/json") {
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({
				cookie: request.headers.cookie ?? "",
				message: "<script>literal</script>",
			}),
		);
	} else if (request.url === "/html") {
		response.setHeader("content-type", "text/html");
		response.end("<h1>Unsupported HTML</h1>");
	} else if (request.url === "/empty") {
		response.writeHead(204);
		response.end();
	} else {
		response.setHeader("content-type", "text/plain");
		response.end("Plain text from the local HTTP fixture\nSecond line");
	}
});

function session() {
	const instance = new BrowserSession({
		createTransport: (cookieJar) =>
			new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [origin] }),
		loadDocument: loadTextDocument,
	});
	sessions.push(instance);
	return instance;
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing session fixture address");
	origin = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
	for (const instance of sessions.splice(0)) instance.close();
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("loads actual HTTP text/JSON into documents, follows redirects and shares cookies only within a profile", async () => {
	const first = session();
	const tab = first.createTab();
	await first.navigate(tab.id, `${origin}/text`);
	const old = first.page(tab.id).document;
	expect(old.textContent(old.root)).toContain(
		"Plain text from the local HTTP fixture",
	);
	const navigation = await first.navigate(tab.id, "/redirect");
	expect(navigation).toMatchObject({
		url: `${origin}/json`,
		response: { redirects: 1, status: 200 },
	});
	expect(old.nodeCount).toBe(0);
	const current = first.page(tab.id).document;
	expect(current.textContent(current.root)).toContain("fixture=session");
	expect(first.page(tab.id).queries.querySelector("script")).toBeNull();
	const secondTab = first.createTab();
	await first.navigate(secondTab.id, `${origin}/json`);
	const shared = first.page(secondTab.id).document;
	expect(shared.textContent(shared.root)).toContain("fixture=session");
	const isolated = session();
	const isolatedTab = isolated.createTab();
	await isolated.navigate(isolatedTab.id, `${origin}/json`);
	const fresh = isolated.page(isolatedTab.id).document;
	expect(JSON.parse(fresh.textContent(fresh.root)).cookie).toBe("");
	first.close();
	isolated.close();
	expect(first.metrics()).toMatchObject({
		pendingLoads: 0,
		network: { active: 0, closed: true },
		cookies: { cookies: 0, closed: true },
	});
});

it("rejects unsupported HTML and preserves the last committed document across failure and HTTP 204", async () => {
	const instance = session();
	const tab = instance.createTab();
	await instance.navigate(tab.id, `${origin}/text`);
	const page = instance.page(tab.id);
	await expect(instance.navigate(tab.id, "/html")).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(instance.page(tab.id)).toBe(page);
	expect((await instance.navigate(tab.id, "/empty")).kind).toBe("no-content");
	expect(instance.page(tab.id)).toBe(page);
	expect(instance.metrics().pendingLoads).toBe(0);
});

it("traverses real HTTP documents while preserving history state and the profile cookie jar", async () => {
	const instance = session();
	const tab = instance.createTab();
	await instance.navigate(tab.id, `${origin}/text`);
	const original = instance.page(tab.id);
	original.history.replaceState({ saved: "synthetic state" });
	await instance.navigate(tab.id, `${origin}/redirect`);
	expect(instance.history(tab.id)).toMatchObject({ index: 1, length: 2 });
	await instance.back(tab.id);
	expect(instance.page(tab.id).history.snapshot().state).toEqual({
		saved: "synthetic state",
	});
	expect(
		instance
			.page(tab.id)
			.document.textContent(instance.page(tab.id).document.root),
	).toContain("Plain text from the local HTTP fixture");
	expect(original.document.nodeCount).toBe(0);
	await instance.forward(tab.id);
	const current = instance.page(tab.id).document;
	expect(JSON.parse(current.textContent(current.root)).cookie).toBe(
		"fixture=session",
	);
	await instance.reload(tab.id);
	expect(instance.history(tab.id)).toMatchObject({ index: 1, length: 2 });
});
