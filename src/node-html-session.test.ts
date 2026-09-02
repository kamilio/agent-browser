import { type Server, createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { renderSnapshot } from "./snapshot.js";

const sessions: BrowserSession[] = [];
const servers: Server[] = [];
afterEach(async () => {
	for (const session of sessions.splice(0)) session.close();
	for (const server of servers.splice(0)) {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

async function fixture() {
	const requests: {
		url: string;
		method: string;
		body: string;
		cookie?: string;
		origin?: string;
	}[] = [];
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		requests.push({
			url: request.url ?? "",
			method: request.method ?? "",
			body: Buffer.concat(chunks).toString(),
			cookie: request.headers.cookie,
			origin: request.headers.origin,
		});
		response.setHeader("content-type", "text/html; charset=utf-8");
		if (request.url === "/") {
			response.setHeader(
				"set-cookie",
				"fixture=synthetic; Path=/; SameSite=Lax",
			);
			response.end(
				'<!doctype html><title>Fixture</title><base href="/base/"><h1>Real parsed page</h1><a id=next href=next>Next document</a><form method=post action=/echo><label>Name <input name=name required></label><input name=email type=email><input name=delivery type=time min=11:00 max=21:00 step=900><input type=checkbox name=enabled value=yes><select name=choice><option value=one>One<option value=two>Two</select><button name=action value=send>Send</button></form><script src=/never-fetch.js>globalThis.__htmlExecuted=true;</script><img src=/never-image><meta http-equiv=refresh content="0;url=/never-refresh">',
			);
		} else if (request.url === "/base/next")
			response.end("<!doctype html><h1>Second page</h1><a href=/>Home</a>");
		else if (request.url === "/unsupported")
			response.end("<!doctype html><svg><text>Not supported</text></svg>");
		else if (request.url === "/echo") {
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({
					form: Object.fromEntries(
						new URLSearchParams(Buffer.concat(chunks).toString()),
					),
				}),
			);
		} else {
			response.statusCode = 404;
			response.end("Not found");
		}
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing server address");
	const origin = `http://127.0.0.1:${address.port}`;
	const session = new BrowserSession({
		createTransport: (cookieJar) =>
			new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [origin] }),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	const navigation = await session.navigate(tab.id, origin);
	const page = session.page(tab.id);
	const ref = (selector: string) => {
		const id = page.queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return page.document.reference(id);
	};
	return { origin, session, tab, page, ref, requests, navigation };
}

it("loads actual HTML, follows a parsed base-relative link by reference and traverses history", async () => {
	const { session, tab, page, ref, requests, navigation, origin } =
		await fixture();
	expect(navigation.html).toMatchObject({
		partial: true,
		scripting: false,
		encoding: "utf-8",
	});
	expect(renderSnapshot(session.snapshot(tab.id))).toContain(
		"Real parsed page",
	);
	const next = ref("#next");
	expect((await session.click(tab.id, next)).navigation?.url).toBe(
		`${origin}/base/next`,
	);
	expect(requests[1].cookie).toContain("fixture=synthetic");
	expect(page.document.nodeCount).toBe(0);
	await session.back(tab.id);
	expect(renderSnapshot(session.snapshot(tab.id))).toContain(
		"Real parsed page",
	);
	expect(() => session.page(tab.id).document.resolve(next)).toThrow();
});

it("submits parsed native controls via focus/type/Enter and loads a real HTTP echo", async () => {
	const { session, tab, page, ref, requests, origin } = await fixture();
	page.interactions.setChecked(ref("input[type=checkbox]"), true);
	page.interactions.select(ref("select"), ["two"]);
	await session.click(tab.id, ref("input[name=name]"));
	page.interactions.keyboard.type("synthetic 🙂");
	const result = await session.press(tab.id, "Enter");
	expect(result.navigation?.kind).toBe("document");
	expect(result.form?.invalid).toEqual([]);
	expect(requests).toHaveLength(2);
	expect(requests[1]).toMatchObject({ method: "POST", url: "/echo", origin });
	expect(Object.fromEntries(new URLSearchParams(requests[1].body))).toEqual({
		name: "synthetic 🙂",
		email: "",
		delivery: "",
		enabled: "yes",
		choice: "two",
		action: "send",
	});
	const current = session.page(tab.id).document;
	expect(JSON.parse(current.textContent(current.root)).form.name).toBe(
		"synthetic 🙂",
	);
});

it("blocks a parsed required form without network side effects", async () => {
	const { session, tab, ref, requests } = await fixture();
	const result = await session.click(tab.id, ref("button"));
	expect(result.form?.invalid).toEqual([
		{ reference: ref("input[name=name]"), reason: "value-missing" },
	]);
	expect(requests).toHaveLength(1);
});

it("preserves the committed HTML page and refs when unsupported construction fails", async () => {
	const { session, tab, page, ref, origin } = await fixture();
	const link = ref("#next");
	await expect(
		session.navigate(tab.id, `${origin}/unsupported`),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(session.page(tab.id)).toBe(page);
	expect(page.document.resolve(link).attributes.id).toBe("next");
});

it("never executes scripts or automatically fetches script/image/refresh resources", async () => {
	const { session, tab, requests } = await fixture();
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(requests.map((entry) => entry.url)).toEqual(["/"]);
	expect(renderSnapshot(session.snapshot(tab.id))).not.toContain(
		"__htmlExecuted",
	);
	expect(Object.hasOwn(globalThis, "__htmlExecuted")).toBe(false);
});
