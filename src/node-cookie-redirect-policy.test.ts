import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
	CookieJar,
	type CookieJarOptions,
	type CookieRequestContext,
} from "./cookies.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type PinnedPublicSuffixSnapshot,
	createPinnedPublicSuffixSnapshot,
} from "./pinned-public-suffix.js";

const first = "https://app.example.co.uk/";
const second = "https://media.example.co.uk/";
const third = "https://meeting.example.co.uk/";
const outside = "https://unrelated.example.net/";
const strictAndNone = "strict=synthetic; none=synthetic";
const onlyNone = "none=synthetic";
let snapshot: PinnedPublicSuffixSnapshot;
const jars: CookieJar[] = [];
const transports: NodeNetworkTransport[] = [];

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
	for (const transport of transports.splice(0)) {
		transport.close();
		expect(transport.metrics()).toMatchObject({ closed: true, active: 0 });
	}
	for (const jar of jars.splice(0)) {
		jar.close();
		expect(jar.metrics()).toMatchObject({ closed: true, cookies: 0 });
	}
	vi.restoreAllMocks();
});

function fixture(
	options: CookieJarOptions = { publicSuffixSnapshot: snapshot },
) {
	const jar = new CookieJar({}, () => Date.UTC(2026, 8, 18), options);
	jars.push(jar);
	const selected: { url: string; cookie: string; tainted: boolean }[] = [];
	const retrieve = jar.cookieHeader.bind(jar);
	vi.spyOn(jar, "cookieHeader").mockImplementation((url, context) => {
		const cookie = retrieve(url, context);
		selected.push({ url, cookie, tainted: context.crossSiteRedirect === true });
		return cookie;
	});
	const resolver = vi.fn(async () => {
		throw new Error("A mocked cookie redirect must not resolve DNS");
	});
	const transport = new NodeNetworkTransport({
		cookieJar: jar,
		resolver,
		limits: {
			maxRequests: 8,
			maxRedirects: 7,
			maxResponseBytes: 1024,
			maxTotalBytes: 8192,
		},
	});
	transports.push(transport);
	return { jar, selected, resolver, transport };
}

function seed(jar: CookieJar, urls: readonly string[]) {
	for (const url of new Set(urls)) {
		for (const policy of ["Strict", "None"])
			expect(
				jar.setCookie(
					url,
					`${policy.toLowerCase()}=synthetic; Path=/; Secure; HttpOnly; SameSite=${policy}`,
					{ siteUrl: url },
				).accepted,
			).toBe(true);
	}
}

async function chain(
	client: ReturnType<typeof fixture>,
	urls: readonly string[],
	context: Partial<CookieRequestContext> = {},
	status = 302,
	responseCookies: readonly string[] = [],
) {
	let visits = 0;
	const response = await client.transport.requestWithRoutes(
		{
			url: urls[0],
			redirect: "follow",
			cookieContext: {
				credentials: "include",
				siteUrl: urls[0],
				topLevelNavigation: false,
				...context,
			},
		},
		(request) => {
			const index = visits++;
			expect(request.url).toBe(urls[index]);
			expect(request.method).toBe("GET");
			const result: NetworkResponse = {
				url: request.url,
				status: index === urls.length - 1 ? 200 : status,
				headers: {
					...(index < urls.length - 1 ? { location: [urls[index + 1]] } : {}),
					...(responseCookies[index]
						? { "set-cookie": [responseCookies[index]] }
						: {}),
				},
				body: new Uint8Array(),
				redirects: [],
				encodedBytes: 0,
				elapsedMs: 0,
			};
			return result;
		},
	);
	expect(visits).toBe(urls.length);
	expect(client.resolver).not.toHaveBeenCalled();
	expect(client.transport.metrics()).toMatchObject({
		requests: urls.length,
		mockedRequests: urls.length,
		redirects: urls.length - 1,
		active: 0,
	});
	return response;
}

it("binds instance sameSite to the selected snapshot and rejects use after close", () => {
	const options: CookieJarOptions = { publicSuffixSnapshot: snapshot };
	const { jar } = fixture(options);
	const legacy = fixture({}).jar;
	options.publicSuffixSnapshot = undefined;
	expect(jar.sameSite(first, second)).toBe(true);
	expect(legacy.sameSite(first, second)).toBe(false);
	expect(legacy.sameSite(first, first)).toBe(true);
	expect(jar.sameSite(first, null)).toBe(false);
	expect(jar.sameSite(first, "http://app.example.co.uk/")).toBe(false);
	expect(jar.sameSite(first, outside)).toBe(false);
	expect(jar.sameSite("https://one.github.io/", "https://two.github.io/")).toBe(
		false,
	);
	expect(Object.hasOwn(jar, "publicSuffixSnapshot")).toBe(false);
	jar.close();
	expect(() => jar.sameSite(first, second)).toThrow("closed");
});

it.each([301, 302, 303, 307, 308])(
	"keeps a PSL same-site sibling redirect chain untainted for %i",
	async (status) => {
		const client = fixture();
		seed(client.jar, [first, second, third]);
		expect(
			client.jar.setCookie(
				first,
				"shared=synthetic; Domain=example.co.uk; Path=/; Secure; HttpOnly; SameSite=Strict",
				{ siteUrl: first },
			).accepted,
		).toBe(true);
		const response = await chain(client, [first, second, third], {}, status);
		expect(response.url).toBe(third);
		expect(client.selected.map((request) => request.cookie)).toEqual(
			Array(3).fill(`${strictAndNone}; shared=synthetic`),
		);
		expect(client.selected.map((request) => request.tainted)).toEqual([
			false,
			false,
			false,
		]);
		expect(client.jar.documentCookie(third, first)).toBe("");
	},
);

it("retains host-only default redirect taint without a selected snapshot", async () => {
	const client = fixture({});
	seed(client.jar, [first, second]);
	await chain(client, [first, second, first]);
	expect(client.selected.map((request) => request.cookie)).toEqual([
		strictAndNone,
		onlyNone,
		onlyNone,
	]);
	expect(client.selected.map((request) => request.tainted)).toEqual([
		false,
		true,
		true,
	]);
});

it.each([
	["unrelated", first, outside],
	["public suffix", "https://example.co.uk/", "https://co.uk/"],
	["private suffix", "https://one.github.io/", "https://two.github.io/"],
	[
		"nested private ancestor",
		"https://bucket.s3.amazonaws.com/",
		"https://amazonaws.com/",
	],
])("preserves %s cross-site-and-back taint", async (_kind, start, middle) => {
	const client = fixture();
	seed(client.jar, [start, middle]);
	await chain(client, [start, middle, start]);
	expect(client.selected.map((request) => request.cookie)).toEqual([
		strictAndNone,
		onlyNone,
		onlyNone,
	]);
	expect(client.selected.map((request) => request.tainted)).toEqual([
		false,
		true,
		true,
	]);
});

it("taints an initial outside hop even when its next target is same-site", async () => {
	const client = fixture();
	seed(client.jar, [outside, first, second]);
	await chain(client, [outside, first, second], { siteUrl: first });
	expect(client.selected.map((request) => request.cookie)).toEqual([
		onlyNone,
		onlyNone,
		onlyNone,
	]);
	expect(client.selected.map((request) => request.tainted)).toEqual([
		false,
		true,
		true,
	]);
});

it("does not clear preexisting taint on an entirely same-site chain", async () => {
	const client = fixture();
	seed(client.jar, [first, second, third]);
	await chain(client, [first, second, third], { crossSiteRedirect: true });
	expect(client.selected.map((request) => request.cookie)).toEqual([
		onlyNone,
		onlyNone,
		onlyNone,
	]);
	expect(client.selected.every((request) => request.tainted)).toBe(true);
});

it("treats an HTTP to HTTPS scheme change as cross-site", async () => {
	const client = fixture();
	const insecure = "http://app.example.co.uk/";
	seed(client.jar, [first, second]);
	expect(
		client.jar.setCookie(insecure, "clear=synthetic; SameSite=Strict; Path=/", {
			siteUrl: insecure,
		}).accepted,
	).toBe(true);
	await chain(client, [insecure, first, second]);
	expect(client.selected.map((request) => request.cookie)).toEqual([
		"clear=synthetic",
		onlyNone,
		onlyNone,
	]);
	expect(client.selected.map((request) => request.tainted)).toEqual([
		false,
		true,
		true,
	]);
});

it("still rejects HTTPS downgrade before the insecure next request", async () => {
	const client = fixture();
	seed(client.jar, [first]);
	await expect(
		chain(client, [first, "http://app.example.co.uk/"]),
	).rejects.toThrow();
	expect(client.selected.map((request) => request.cookie)).toEqual([
		strictAndNone,
	]);
	expect(client.transport.metrics()).toMatchObject({
		requests: 1,
		mockedRequests: 1,
		active: 0,
	});
	expect(client.resolver).not.toHaveBeenCalled();
});

it("keeps same-origin credentials origin-based and tainted after a sibling bounce", async () => {
	const client = fixture();
	seed(client.jar, [first, second]);
	const accepted = client.jar.metrics().accepted;
	await chain(
		client,
		[first, second, first],
		{ credentials: "same-origin" },
		302,
		[
			"initial=synthetic; Path=/; SameSite=Strict",
			"sibling=blocked; Path=/; SameSite=Strict",
			"returned=blocked; Path=/; SameSite=Strict",
		],
	);
	expect(client.selected).toEqual([
		{ url: first, cookie: strictAndNone, tainted: false },
	]);
	expect(client.jar.metrics().accepted).toBe(accepted + 1);
	expect(client.jar.documentCookie(first, first)).toBe("initial=synthetic");
	expect(client.jar.documentCookie(second, second)).toBe("");
});

it("does not mistake a same-site initial origin for same-origin credentials", async () => {
	const client = fixture();
	seed(client.jar, [first, second]);
	await chain(client, [second, first], {
		siteUrl: first,
		credentials: "same-origin",
	});
	expect(client.selected).toEqual([]);
});

it("keeps credential omission independent of the selected same-site policy", async () => {
	const client = fixture();
	seed(client.jar, [first, second]);
	const accepted = client.jar.metrics().accepted;
	await chain(client, [first, second], { credentials: "omit" }, 302, [
		"ignored=synthetic",
		"ignored=synthetic",
	]);
	expect(client.selected).toEqual([]);
	expect(client.jar.metrics().accepted).toBe(accepted);
});

it("preserves following mocked redirects without a cookie jar or context", async () => {
	const resolver = vi.fn(async () => {
		throw new Error("Unexpected DNS");
	});
	const transport = new NodeNetworkTransport({ resolver });
	transports.push(transport);
	const urls = [first, second, first];
	let visits = 0;
	const response = await transport.requestWithRoutes(
		{ url: first },
		(request) => {
			expect(request.url).toBe(urls[visits]);
			const index = visits++;
			return {
				url: request.url,
				status: index === 2 ? 200 : 302,
				headers: index === 2 ? {} : { location: [urls[index + 1]] },
				body: new Uint8Array(),
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			};
		},
	);
	expect(response.url).toBe(first);
	expect(visits).toBe(3);
	expect(resolver).not.toHaveBeenCalled();
	expect(transport.metrics()).toMatchObject({
		requests: 3,
		mockedRequests: 3,
		redirects: 2,
		active: 0,
	});
});
