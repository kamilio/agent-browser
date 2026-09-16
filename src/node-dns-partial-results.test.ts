import { getEventListeners } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NetworkPolicy, type NetworkRequest } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";

const dns = vi.hoisted(() => {
	const resolve4 = vi.fn<(hostname: string) => Promise<string[]>>();
	const resolve6 = vi.fn<(hostname: string) => Promise<string[]>>();
	const cancel = vi.fn<() => void>();
	return {
		resolve4,
		resolve6,
		cancel,
		Resolver: vi.fn(function (
			this: object,
			_options: { timeout: number; tries: number },
		) {
			Object.assign(this, { resolve4, resolve6, cancel });
		}),
	};
});

const wire = vi.hoisted(() => {
	const refuse = (..._arguments: unknown[]) => {
		throw Object.assign(new Error("Synthetic DNS test wire refusal"), {
			code: "ETESTWIRE",
		});
	};
	return {
		http: vi.fn(refuse),
		https: vi.fn(refuse),
		forbidden: vi.fn(refuse),
	};
});

vi.mock("node:dns/promises", () => ({ Resolver: dns.Resolver }));
vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: wire.http,
	get: wire.forbidden,
	createServer: wire.forbidden,
}));
vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: wire.https,
	get: wire.forbidden,
	createServer: wire.forbidden,
}));

const hostname = "dns-partial.example";
const public4 = "93.184.216.34";
const public6 = "2606:4700:4700::1111";
const transports: NodeNetworkTransport[] = [];
const pending: Promise<unknown>[] = [];
const cancellations: (() => void)[] = [];
const ownedAbortListeners: { signal: AbortSignal; listener: unknown }[] = [];

function observeListeners() {
	return {
		add: vi.spyOn(AbortSignal.prototype, "addEventListener"),
		remove: vi.spyOn(AbortSignal.prototype, "removeEventListener"),
	};
}

let listeners: ReturnType<typeof observeListeners>;
let checked: ReturnType<typeof observePolicy>;

function observePolicy() {
	return vi.spyOn(NetworkPolicy.prototype, "checkAddresses");
}

function dnsError(code: string) {
	return Object.assign(new Error("Synthetic DNS failure"), { code });
}

function cancelPendingDns() {
	for (const cancel of cancellations.splice(0)) cancel();
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	dns.resolve4.mockReset().mockResolvedValue([]);
	dns.resolve6.mockReset().mockResolvedValue([]);
	dns.cancel.mockReset().mockImplementation(cancelPendingDns);
	listeners = observeListeners();
	checked = observePolicy();
});

afterEach(async () => {
	try {
		for (const transport of transports) transport.close();
		cancelPendingDns();
		await Promise.allSettled(pending.splice(0));
		for (const transport of transports)
			expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
		for (const { signal, listener } of ownedAbortListeners.splice(0))
			expect(getEventListeners(signal, "abort")).not.toContain(listener);
		expect(wire.forbidden).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		transports.length = 0;
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.useRealTimers();
	}
});

function fixture() {
	const transport = new NodeNetworkTransport();
	transports.push(transport);
	return transport;
}

function track<Value>(promise: Promise<Value>) {
	pending.push(promise);
	void promise.catch(() => {});
	return promise;
}

function request(
	transport: NodeNetworkTransport,
	input: Partial<NetworkRequest> = {},
) {
	const firstListener = listeners.add.mock.calls.length;
	const result = transport.request({ url: `https://${hostname}/`, ...input });
	for (
		let index = firstListener;
		index < listeners.add.mock.calls.length;
		index++
	) {
		const [event, listener] = listeners.add.mock.calls[index];
		if (event === "abort")
			ownedAbortListeners.push({
				signal: listeners.add.mock.contexts[index] as AbortSignal,
				listener,
			});
	}
	return track(result);
}

function deferFamily(family: "resolve4" | "resolve6") {
	let resolve!: (addresses: string[]) => void;
	const promise = track(
		new Promise<string[]>((resolveAddresses, reject) => {
			resolve = resolveAddresses;
			cancellations.push(() => reject(dnsError("ECANCELLED")));
		}),
	);
	dns[family].mockReturnValueOnce(promise);
	return { promise, resolve };
}

function expectResolution() {
	expect(dns.Resolver.mock.calls).toEqual([[{ timeout: 2000, tries: 2 }]]);
	expect(dns.resolve4.mock.calls).toEqual([[hostname]]);
	expect(dns.resolve6.mock.calls).toEqual([[hostname]]);
	expect(dns.resolve4.mock.invocationCallOrder[0]).toBeLessThan(
		dns.resolve6.mock.invocationCallOrder[0],
	);
}

function expectNoWire() {
	expect(wire.http).not.toHaveBeenCalled();
	expect(wire.https).not.toHaveBeenCalled();
}

async function expectAdmission(
	result: Promise<unknown>,
	addresses: string[],
	protocol: "http" | "https" = "https",
) {
	await expect(result).rejects.toMatchObject({
		code: "network-error",
		message: "Network request failed (ETESTWIRE)",
	});
	expectResolution();
	expect(checked.mock.calls).toEqual([
		[`${protocol}://${hostname}/`, addresses],
	]);
	expect(wire[protocol]).toHaveBeenCalledTimes(1);
	expect(wire[protocol].mock.calls[0][0]).toMatchObject({
		hostname: addresses[0],
		port: protocol === "https" ? 443 : 80,
		path: "/",
		method: "GET",
		agent: false,
	});
	if (protocol === "https")
		expect(wire.https.mock.calls[0][0]).toMatchObject({
			servername: hostname,
			rejectUnauthorized: true,
		});
	expect(wire[protocol === "https" ? "http" : "https"]).not.toHaveBeenCalled();
	expect(dns.cancel).not.toHaveBeenCalled();
}

it.each(
	["ESERVFAIL", "ETIMEOUT", "EREFUSED", "ENODATA", "ENOTFOUND"].flatMap(
		(code) => [
			{ code, family: "A", protocol: "http" as const },
			{ code, family: "AAAA", protocol: "https" as const },
		],
	),
)(
	"admits $family results when the other family rejects with $code",
	async ({ code, family, protocol }) => {
		const addresses = family === "A" ? [public4] : [public6];
		dns[family === "A" ? "resolve4" : "resolve6"].mockResolvedValue(addresses);
		dns[family === "A" ? "resolve6" : "resolve4"].mockRejectedValue(
			dnsError(code),
		);
		await expectAdmission(
			request(fixture(), { url: `${protocol}://${hostname}/` }),
			addresses,
			protocol,
		);
	},
);

it("waits for both families and preserves A-before-AAAA and first-address use", async () => {
	const ipv4 = deferFamily("resolve4");
	const ipv6 = deferFamily("resolve6");
	const result = request(fixture());
	expectResolution();
	ipv6.resolve([public6, "2606:4700:4700::1001"]);
	await ipv6.promise;
	await Promise.resolve();
	expectNoWire();
	expect(checked).not.toHaveBeenCalled();
	ipv4.resolve([public4, "8.8.8.8"]);
	await expectAdmission(result, [
		public4,
		"8.8.8.8",
		public6,
		"2606:4700:4700::1001",
	]);
});

it.each([
	{ family: "A", ipv4: [public4], ipv6: [] },
	{ family: "AAAA", ipv4: [], ipv6: [public6] },
])(
	"admits $family results when the other family fulfills empty",
	async ({ ipv4, ipv6 }) => {
		dns.resolve4.mockResolvedValue(ipv4);
		dns.resolve6.mockResolvedValue(ipv6);
		await expectAdmission(request(fixture()), [...ipv4, ...ipv6]);
	},
);

type DnsOutcome = string[] | string;

function outcomes(ipv4: DnsOutcome, ipv6: DnsOutcome) {
	if (typeof ipv4 === "string") dns.resolve4.mockRejectedValue(dnsError(ipv4));
	else dns.resolve4.mockResolvedValue(ipv4);
	if (typeof ipv6 === "string") dns.resolve6.mockRejectedValue(dnsError(ipv6));
	else dns.resolve6.mockResolvedValue(ipv6);
}

it.each([
	{ label: "private AAAA", ipv4: [public4], ipv6: ["::1"] },
	{ label: "private A", ipv4: ["127.0.0.1"], ipv6: [public6] },
	{
		label: "invalid A with AAAA failure",
		ipv4: [public4, "not-an-address"],
		ipv6: "ESERVFAIL",
	},
	{
		label: "private AAAA with A failure",
		ipv4: "ETIMEOUT",
		ipv6: [public6, "fc00::1"],
	},
])(
	"rejects all fulfilled addresses before wire for $label",
	async ({ ipv4, ipv6 }) => {
		outcomes(ipv4, ipv6);
		await expect(request(fixture())).rejects.toMatchObject({
			code: "policy-denied",
			message: "DNS returned a private, reserved or invalid address",
		});
		expectResolution();
		expect(checked.mock.calls).toEqual([
			[
				`https://${hostname}/`,
				[
					...(Array.isArray(ipv4) ? ipv4 : []),
					...(Array.isArray(ipv6) ? ipv6 : []),
				],
			],
		]);
		expectNoWire();
		expect(dns.cancel).not.toHaveBeenCalled();
	},
);

it.each([
	{
		label: "both empty",
		ipv4: [],
		ipv6: [],
		message: "DNS returned no addresses",
	},
	{
		label: "both absent",
		ipv4: "ENODATA",
		ipv6: "ENOTFOUND",
		message: "DNS returned no addresses",
	},
	{
		label: "empty A and failed AAAA",
		ipv4: [],
		ipv6: "ETIMEOUT",
		message: "DNS resolution failed",
	},
	{
		label: "failed A and absent AAAA",
		ipv4: "EREFUSED",
		ipv6: "ENODATA",
		message: "DNS resolution failed",
	},
])("preserves the DNS error for $label", async ({ ipv4, ipv6, message }) => {
	outcomes(ipv4, ipv6);
	await expect(request(fixture())).rejects.toMatchObject({
		code: "network-error",
		message,
	});
	expectResolution();
	expect(checked).not.toHaveBeenCalled();
	expectNoWire();
	expect(dns.cancel).not.toHaveBeenCalled();
});

it("rejects an already-aborted request without starting DNS", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		request(fixture(), { signal: controller.signal }),
	).rejects.toMatchObject({
		code: "aborted",
		message: "Request aborted",
	});
	expect(dns.Resolver).not.toHaveBeenCalled();
	expect(dns.resolve4).not.toHaveBeenCalled();
	expect(dns.resolve6).not.toHaveBeenCalled();
	expect(dns.cancel).not.toHaveBeenCalled();
	expect(checked).not.toHaveBeenCalled();
	expectNoWire();
});

it("cancels an in-flight resolver even after one family succeeds", async () => {
	const controller = new AbortController();
	dns.resolve4.mockResolvedValue([public4]);
	deferFamily("resolve6");
	const result = request(fixture(), { signal: controller.signal });
	await Promise.resolve();
	expectResolution();
	controller.abort();
	await expect(result).rejects.toMatchObject({
		code: "aborted",
		message: "Request aborted",
	});
	expectResolution();
	expect(dns.cancel).toHaveBeenCalledTimes(1);
	expect(checked).not.toHaveBeenCalled();
	expectNoWire();
});

it("cancels pending DNS at the default request deadline", async () => {
	deferFamily("resolve4");
	deferFamily("resolve6");
	const result = request(fixture());
	expectResolution();
	await vi.advanceTimersByTimeAsync(14_999);
	expect(dns.cancel).not.toHaveBeenCalled();
	expectNoWire();
	await vi.advanceTimersByTimeAsync(1);
	await expect(result).rejects.toMatchObject({
		code: "timeout",
		message: "Network deadline exceeded",
	});
	expectResolution();
	expect(dns.cancel).toHaveBeenCalledTimes(1);
	expect(checked).not.toHaveBeenCalled();
	expectNoWire();
});

it("closing the transport cancels DNS and rejects further requests", async () => {
	deferFamily("resolve4");
	deferFamily("resolve6");
	const transport = fixture();
	const result = request(transport);
	expectResolution();
	transport.close();
	await expect(result).rejects.toMatchObject({
		code: "closed",
		message: "Transport is closed",
	});
	transport.close();
	await expect(request(transport)).rejects.toMatchObject({ code: "closed" });
	expectResolution();
	expect(dns.cancel).toHaveBeenCalledTimes(1);
	expect(checked).not.toHaveBeenCalled();
	expectNoWire();
});
