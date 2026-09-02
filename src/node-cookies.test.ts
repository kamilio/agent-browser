import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { CookieJar, type CookieRequestContext } from "./cookies.js";
import { type NetworkResponse, decodeResponseText } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";

let origin = "";
let otherOrigin = "";
const clients: NodeNetworkTransport[] = [];
const jars: CookieJar[] = [];
const visits: { host: string; path: string; cookie: string }[] = [];
const server = createServer((request, response) => {
	const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
	visits.push({
		host: url.host,
		path: url.pathname,
		cookie: request.headers.cookie ?? "",
	});
	if (url.pathname === "/set") {
		response.writeHead(Number(url.searchParams.get("status") ?? 302), {
			"set-cookie": [
				"session=fixture; Path=/; HttpOnly",
				"public=visible; Path=/",
				"domain=unsupported; Domain=cookie.test; Path=/",
			],
			location: url.searchParams.get("to") ?? "/echo",
		});
		response.end();
	} else if (url.pathname === "/expire") {
		response.writeHead(302, {
			"set-cookie": "session=gone; Path=/; Max-Age=0",
			location: "/echo",
		});
		response.end();
	} else if (url.pathname === "/redirect") {
		response.writeHead(Number(url.searchParams.get("status") ?? 302), {
			location: url.searchParams.get("to") ?? "/echo",
		});
		response.end();
	} else if (url.pathname === "/body-fail") {
		response.writeHead(200, {
			"set-cookie": "received=yes; Path=/",
			"content-encoding": "unsupported",
		});
		response.end("cannot decode");
	} else {
		response.end(
			JSON.stringify({
				cookie: request.headers.cookie ?? "",
				method: request.method,
				host: url.host,
			}),
		);
	}
});

function client(options: NodeTransportOptions = {}) {
	const jar = options.cookieJar ?? new CookieJar();
	jars.push(jar);
	const transport = new NodeNetworkTransport({
		allowPrivateOrigins: [origin, otherOrigin],
		resolver: async () => ["127.0.0.1"],
		...options,
		cookieJar: jar,
	});
	clients.push(transport);
	return { jar, transport };
}

function context(
	overrides: Partial<CookieRequestContext> = {},
): CookieRequestContext {
	return {
		siteUrl: origin,
		topLevelNavigation: true,
		credentials: "include",
		...overrides,
	};
}

function echo(response: NetworkResponse) {
	return JSON.parse(decodeResponseText(response).text) as {
		cookie: string;
		method: string;
		host: string;
	};
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing cookie fixture address");
	origin = `http://cookie.test:${address.port}`;
	otherOrigin = `http://other.test:${address.port}`;
});

afterEach(() => {
	for (const transport of clients.splice(0)) transport.close();
	for (const jar of jars.splice(0)) jar.close();
	visits.length = 0;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("stores redirect cookies before following and returns them to subsequent requests", async () => {
	const { transport, jar } = client();
	const response = await transport.request({
		url: `${origin}/set`,
		cookieContext: context(),
	});
	expect(echo(response).cookie).toBe("session=fixture; public=visible");
	expect(response.redirects).toHaveLength(1);
	expect(jar.documentCookie(origin, origin)).toBe("public=visible");
	expect(jar.metrics().rejections).toEqual({ "domain-unsupported": 1 });
	const later = await transport.request({
		url: `${origin}/echo`,
		cookieContext: context(),
	});
	expect(echo(later).cookie).toBe("session=fixture; public=visible");
	expect(transport.metrics().active).toBe(0);
});

it("isolates independent jars and permits explicitly shared profile jars across clients", async () => {
	const first = client();
	await first.transport.request({
		url: `${origin}/set`,
		cookieContext: context(),
	});
	const isolated = client();
	expect(
		echo(
			await isolated.transport.request({
				url: origin,
				cookieContext: context(),
			}),
		).cookie,
	).toBe("");
	const shared = client({ cookieJar: first.jar });
	expect(
		echo(
			await shared.transport.request({ url: origin, cookieContext: context() }),
		).cookie,
	).toBe("session=fixture; public=visible");
	first.transport.close();
	expect(first.jar.metrics().closed).toBe(false);
	expect(
		echo(
			await shared.transport.request({ url: origin, cookieContext: context() }),
		).cookie,
	).toContain("session=fixture");
});

it("omits both cookie storage and transmission without an explicit context or with credentials omit", async () => {
	const { transport, jar } = client();
	for (const cookieContext of [undefined, context({ credentials: "omit" })]) {
		await transport.request({ url: `${origin}/set`, cookieContext });
		expect(jar.metrics().cookies).toBe(0);
	}
	jar.setCookie(origin, "existing=fixture; Path=/", { siteUrl: origin });
	for (const cookieContext of [undefined, context({ credentials: "omit" })])
		expect(
			echo(await transport.request({ url: origin, cookieContext })).cookie,
		).toBe("");
});

it("honors credential same-origin independently from cookie same-site matching", async () => {
	const { transport, jar } = client();
	await transport.request({
		url: `${origin}/set`,
		cookieContext: context({ credentials: "same-origin" }),
	});
	expect(jar.metrics().cookies).toBe(2);
	const differentPort = new URL(origin);
	differentPort.port = differentPort.port === "80" ? "81" : "80";
	expect(
		echo(
			await transport.request({
				url: origin,
				cookieContext: context({
					siteUrl: differentPort.href,
					credentials: "same-origin",
				}),
			}),
		).cookie,
	).toBe("");
	expect(
		echo(
			await transport.request({
				url: origin,
				cookieContext: context({
					siteUrl: differentPort.href,
					credentials: "include",
				}),
			}),
		).cookie,
	).toContain("session=fixture");
});

it("recomputes path cookies on every same-origin redirect rather than forwarding the previous header", async () => {
	const { transport, jar } = client();
	jar.setCookie(origin, "scoped=private; Path=/redirect", { siteUrl: origin });
	const response = await transport.request({
		url: `${origin}/redirect`,
		cookieContext: context(),
	});
	expect(visits[0].cookie).toBe("scoped=private");
	expect(echo(response).cookie).toBe("");
});

it("never sends one host's cookies to another, and uses the destination's own cookies", async () => {
	const { transport, jar } = client();
	jar.setCookie(origin, "first=private; Path=/", { siteUrl: origin });
	jar.setCookie(otherOrigin, "second=private; Path=/", {
		siteUrl: otherOrigin,
	});
	const response = await transport.request({
		url: `${origin}/redirect?to=${encodeURIComponent(`${otherOrigin}/echo`)}`,
		cookieContext: context(),
	});
	expect(visits[0].cookie).toBe("first=private");
	expect(echo(response).cookie).toBe("second=private");
});

it("preserves cross-site redirect taint on a bounce back to the original host", async () => {
	const { transport, jar } = client();
	jar.setCookie(origin, "strict=private; Path=/; SameSite=Strict", {
		siteUrl: origin,
	});
	jar.setCookie(origin, "lax=fixture; Path=/", { siteUrl: origin });
	const bounce = `${otherOrigin}/redirect?to=${encodeURIComponent(`${origin}/echo`)}`;
	const response = await transport.request({
		url: `${origin}/redirect?to=${encodeURIComponent(bounce)}`,
		cookieContext: context(),
	});
	expect(visits[0].cookie).toBe("strict=private; lax=fixture");
	expect(visits[1].cookie).toBe("");
	expect(echo(response).cookie).toBe("lax=fixture");
	const sameOriginOnly = await transport.request({
		url: `${origin}/redirect?to=${encodeURIComponent(bounce)}`,
		cookieContext: context({ credentials: "same-origin" }),
	});
	expect(echo(sameOriginOnly).cookie).toBe("");
});

it("recalculates SameSite Lax after a cross-site POST becomes GET on 303", async () => {
	const { transport, jar } = client();
	jar.setCookie(origin, "lax=fixture; Path=/", { siteUrl: origin });
	const response = await transport.request({
		url: `${origin}/redirect?status=303`,
		method: "POST",
		body: "synthetic",
		cookieContext: context({ siteUrl: otherOrigin }),
	});
	expect(visits[0].cookie).toBe("");
	expect(echo(response)).toMatchObject({
		cookie: "lax=fixture",
		method: "GET",
	});
});

it("processes cookie deletion on redirects and cookie headers even when the body fails", async () => {
	const { transport, jar } = client();
	await transport.request({ url: `${origin}/set`, cookieContext: context() });
	expect(
		echo(
			await transport.request({
				url: `${origin}/expire`,
				cookieContext: context(),
			}),
		).cookie,
	).toBe("public=visible");
	await expect(
		transport.request({ url: `${origin}/body-fail`, cookieContext: context() }),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(jar.cookieHeader(origin, { siteUrl: origin })).toBe(
		"public=visible; received=yes",
	);
	expect(transport.metrics().active).toBe(0);
});

it("processes manual/error redirect response cookies without following", async () => {
	for (const redirect of ["manual", "error"] as const) {
		const { transport, jar } = client();
		const request = transport.request({
			url: `${origin}/set`,
			redirect,
			cookieContext: context(),
		});
		if (redirect === "manual") expect((await request).status).toBe(302);
		else await expect(request).rejects.toMatchObject({ code: "policy-denied" });
		expect(jar.metrics().cookies).toBe(2);
		expect(transport.metrics().requests).toBe(1);
	}
});

it("rejects forged Cookie headers, missing jars, invalid contexts and closed jars before sending", async () => {
	const { transport, jar } = client();
	await expect(
		transport.request({
			url: origin,
			headers: { CoOkIe: "forged=credential" },
			cookieContext: context(),
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		transport.request({
			url: origin,
			cookieContext: { ...context(), credentials: "invalid" as "include" },
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	const withoutJar = new NodeNetworkTransport({
		allowPrivateOrigins: [origin],
	});
	clients.push(withoutJar);
	await expect(
		withoutJar.request({ url: origin, cookieContext: context() }),
	).rejects.toMatchObject({ code: "invalid-input" });
	jar.close();
	await expect(
		transport.request({ url: origin, cookieContext: context() }),
	).rejects.toMatchObject({ code: "closed" });
	expect(visits).toHaveLength(0);
	expect(transport.metrics().active).toBe(0);
});

it("snapshots caller cookie context before awaiting DNS resolution", async () => {
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const { transport, jar } = client({
		resolver: async () => {
			await gate;
			return ["127.0.0.1"];
		},
	});
	jar.setCookie(origin, "private=fixture; Path=/", { siteUrl: origin });
	const requestContext = context({ credentials: "omit" });
	const request = transport.request({
		url: `${origin}/set`,
		cookieContext: requestContext,
	});
	requestContext.credentials = "include";
	release();
	expect(echo(await request).cookie).toBe("");
	expect(jar.metrics().cookies).toBe(1);
});
