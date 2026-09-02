import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

let origin = "";
const sessions: BrowserSession[] = [];
const requests: {
	method: string;
	url: string;
	body: string;
	origin?: string;
	cookie?: string;
}[] = [];
const server = createServer(async (request, response) => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	const record = {
		method: request.method ?? "",
		url: request.url ?? "",
		body: Buffer.concat(chunks).toString(),
		origin: request.headers.origin,
		cookie: request.headers.cookie,
	};
	requests.push(record);
	if (request.url?.startsWith("/redirect/")) {
		response.writeHead(Number(request.url.split("/").at(-1)), {
			location: "/echo",
			"set-cookie": "submission=accepted; Path=/; HttpOnly",
		});
		response.end();
	} else if (request.url === "/html") {
		response.setHeader("content-type", "text/html");
		response.end("<h1>Still unsupported</h1>");
	} else {
		response.setHeader("content-type", "application/json");
		response.end(JSON.stringify(record));
	}
});

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing local fixture");
	origin = `http://127.0.0.1:${address.port}`;
});
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	requests.length = 0;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function fixture(action: string, method = "post") {
	const session = new BrowserSession({
		createTransport: (cookieJar) =>
			new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [origin] }),
		loadDocument: loadTextDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, `${origin}/start`);
	const page = session.page(tab.id);
	const tree = page.document;
	const form = tree.createElement("form", { action, method });
	const input = tree.createElement("input", {
		name: "value",
		value: "synthetic value",
		required: "",
	});
	const button = tree.createElement("button", {
		name: "action",
		value: "send",
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	tree.append(form, button);
	return { session, tab, page, tree, form, button };
}

it.each([301, 302, 303, 307, 308])(
	"loads real HTTP form redirects, cookies and final method for %s",
	async (status) => {
		const { session, tab, tree, button } = await fixture(`/redirect/${status}`);
		const result = await session.click(tab.id, tree.reference(button));
		expect(result.navigation?.response).toMatchObject({
			status: 200,
			redirects: 1,
		});
		const current = session.page(tab.id).document;
		const data = JSON.parse(current.textContent(current.root));
		expect(data.cookie).toBe("submission=accepted");
		expect(data.method).toBe([301, 302, 303].includes(status) ? "GET" : "POST");
		expect(requests[1]).toMatchObject({
			method: "POST",
			body: "value=synthetic+value&action=send",
			origin,
		});
		if ([301, 302, 303].includes(status)) await session.reload(tab.id);
		else expect(() => session.reload(tab.id)).toThrow(/resubmission/);
	},
);

it("HTML response failure retains the old document but does not pretend the POST was undone", async () => {
	const { session, tab, page, tree, button } = await fixture("/html");
	await expect(
		session.click(tab.id, tree.reference(button)),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(requests[1].method).toBe("POST");
	expect(session.page(tab.id)).toBe(page);
	expect(session.metrics().pendingLoads).toBe(0);
});

it("routes GET form query serialization through real navigation", async () => {
	const { session, tab, tree, button } = await fixture(
		"/echo?discard=1",
		"get",
	);
	await session.click(tab.id, tree.reference(button));
	expect(requests[1]).toMatchObject({
		method: "GET",
		url: "/echo?value=synthetic+value&action=send",
		body: "",
	});
});

it("denies an unapproved private target before transmitting the form body", async () => {
	const { session, tab, page, tree, form, button } = await fixture("/echo");
	tree.setAttribute(
		form,
		"action",
		`${origin.replace("127.0.0.1", "localhost")}/echo`,
	);
	await expect(
		session.click(tab.id, tree.reference(button)),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests).toHaveLength(1);
	expect(session.page(tab.id)).toBe(page);
});
