import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { TLSSocket } from "node:tls";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";

const cert = readFileSync(
	new URL("../fixtures/tls/cert.pem", import.meta.url),
	"utf8",
);
const key = readFileSync(
	new URL("../fixtures/tls/key.pem", import.meta.url),
	"utf8",
);
let origin = "";
let requests = 0;
const clients: NodeNetworkTransport[] = [];
const server = createServer({ cert, key }, (request, response) => {
	requests++;
	if (request.url === "/downgrade") {
		response.writeHead(302, { location: "http://example.com/" });
		response.end();
		return;
	}
	response.end(
		JSON.stringify({
			host: request.headers.host,
			servername: (request.socket as TLSSocket).servername,
		}),
	);
});

function client(options: NodeTransportOptions = {}) {
	const instance = new NodeNetworkTransport({
		allowPrivateOrigins: [origin],
		certificateAuthorities: [cert],
		resolver: async () => ["127.0.0.1"],
		...options,
	});
	clients.push(instance);
	return instance;
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing TLS fixture address");
	origin = `https://fixture.test:${address.port}`;
});

afterEach(() => {
	for (const instance of clients.splice(0)) instance.close();
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("validates the original hostname and sends SNI while connecting only to the pinned address", async () => {
	const response = await client().request({ url: origin });
	expect(response.status).toBe(200);
	expect(JSON.parse(new TextDecoder().decode(response.body))).toEqual({
		host: new URL(origin).host,
		servername: "fixture.test",
	});
});

it("rejects an untrusted certificate before transmitting HTTP", async () => {
	const before = requests;
	await expect(
		client({ certificateAuthorities: undefined }).request({ url: origin }),
	).rejects.toMatchObject({ code: "network-error" });
	expect(requests).toBe(before);
});

it("rejects a trusted certificate for the wrong hostname before transmitting HTTP", async () => {
	const before = requests;
	const wrongOrigin = origin.replace("fixture.test", "wrong.fixture.test");
	await expect(
		client({ allowPrivateOrigins: [wrongOrigin] }).request({
			url: wrongOrigin,
		}),
	).rejects.toMatchObject({ code: "network-error" });
	expect(requests).toBe(before);
});

it("rejects a downgrade redirect after a valid HTTPS connection", async () => {
	const instance = client();
	await expect(
		instance.request({ url: `${origin}/downgrade` }),
	).rejects.toMatchObject({
		code: "policy-denied",
		message: "HTTPS downgrade redirects are not allowed",
	});
	expect(instance.metrics().requests).toBe(1);
});

it("validates explicit certificate authorities and cannot disable verification", () => {
	expect(() => client({ certificateAuthorities: [] })).toThrow(
		"Invalid certificate authorities",
	);
	expect(() =>
		client({ certificateAuthorities: ["not a certificate"] }),
	).toThrow("Invalid certificate authority");
});
