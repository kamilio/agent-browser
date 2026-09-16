import { afterEach, describe, expect, it, vi } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import type { BrowserSubmitEvent } from "./form-actions.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";

const sessions: BrowserSession[] = [];
const trees: DocumentTree[] = [];

afterEach(() => {
	try {
		for (const session of sessions.splice(0)) session.close();
	} finally {
		for (const tree of trees.splice(0)) tree.close();
	}
});

const wikipedia = `<!doctype html>
<form id="search-form" action="/w/index.php">
  <input id="query" type="search" name="search">
  <input id="title" type="hidden" name="title" value="Special:Search">
  <button id="submit" name="fulltext" value="Search">Search</button>
</form>`;

const python = `<!doctype html>
<form id="search-form" action="search.html" method="get">
  <input id="query" name="q">
  <button id="submit">Search</button>
</form>`;

const arxiv = `<!doctype html>
<form id="search-form" action="/search/" method="get">
  <input id="query" type="search" name="query">
  <select id="searchtype" name="searchtype">
    <option value="all">All fields</option>
    <option value="title">Title</option>
  </select>
  <input id="show" type="radio" name="abstracts" value="show" checked>
  <input id="hide" type="radio" name="abstracts" value="hide">
  <input id="order" type="hidden" name="order" value="-announced_date_first">
  <input id="size" type="hidden" name="size" value="50">
  <button id="submit">Search</button>
</form>`;

async function fixture(
	markup = wikipedia,
	initialUrl = "https://wikipedia.invalid/wiki/Main_Page",
) {
	const requests: NetworkRequest[] = [];
	const closeTransport = vi.fn();
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				if (requests.length > 2)
					throw new Error("Unexpected synthetic request");
				const body = new TextEncoder().encode(
					requests.length === 1
						? markup
						: '<!doctype html><main id="results">Search results</main>',
				);
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body,
					redirects: [],
					encodedBytes: body.byteLength,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed: closeTransport.mock.calls.length > 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: closeTransport,
		}),
		loadDocument: (response, context) => {
			const tree = parseHtmlDocument(
				new TextDecoder().decode(response.body),
				response.url,
				{
					limits: context.limits,
					signal: context.signal,
					initializeDocument: context.initializeDocument,
				},
			);
			trees.push(tree);
			return tree;
		},
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, initialUrl);
	expect(requests.map((request) => request.url)).toEqual([initialUrl]);
	const page = session.page(tab.id);
	const tree = page.document;
	const byId = (id: string) => {
		const entry = [...tree.walk()].find(
			({ node }) => node.attributes.id === id,
		);
		if (!entry) throw new Error(`Missing synthetic control: ${id}`);
		return entry.node.id;
	};
	const reference = (id: string) => tree.reference(byId(id));
	const formRef = reference("search-form");
	const fill = (value: string, id = "query") =>
		page.interactions.fillAsync(reference(id), value);
	const submit = (submitter?: string) =>
		session.requestSubmit(
			tab.id,
			formRef,
			submitter ? { submitter: reference(submitter) } : {},
		);
	const submitTo = async (url: string, submitter?: string) => {
		const result = await submit(submitter);
		expect(result.form).toEqual({
			formRef,
			canceled: false,
			recursive: false,
			invalid: [],
		});
		expect(result.navigation).toMatchObject({ kind: "document", url });
		expect(result.navigation?.scripts).toBeUndefined();
		expect(requests.map((request) => request.url)).toEqual([initialUrl, url]);
		expect(requests[1].method).toBe("GET");
		expect(requests[1].body).toBeUndefined();
		expect(session.page(tab.id).document).not.toBe(tree);
		expect(session.page(tab.id).document.url).toBe(url);
	};
	return {
		session,
		tab,
		page,
		tree,
		byId,
		reference,
		fill,
		submit,
		submitTo,
		requests,
		closeTransport,
	};
}

describe("synthetic parsed public search forms, not live acceptance", () => {
	it("uses Wikipedia's default GET method and preserves hidden-title query order", async () => {
		const search = await fixture();
		await search.fill("café + A&B/?");
		expect(controlValue(search.tree, search.byId("title"))).toBe(
			"Special:Search",
		);
		await search.submitTo(
			"https://wikipedia.invalid/w/index.php?search=caf%C3%A9+%2B+A%26B%2F%3F&title=Special%3ASearch",
		);
	});

	it("resolves Python's relative action and replaces the action query", async () => {
		const search = await fixture(
			python.replace('action="search.html"', 'action="search.html?old=1"'),
			"https://python.invalid/3/index.html?old=2",
		);
		await search.fill("asyncio tasks");
		await search.submitTo(
			"https://python.invalid/3/search.html?q=asyncio+tasks",
		);
	});

	it("serializes arXiv's default select, checked radio and hidden fields in order", async () => {
		const search = await fixture(arxiv, "https://arxiv.invalid/");
		expect(controlValue(search.tree, search.byId("searchtype"))).toBe("all");
		expect(controlChecked(search.tree, search.byId("show"))).toBe(true);
		expect(controlChecked(search.tree, search.byId("hide"))).toBe(false);
		await search.fill("quantum gravity");
		await search.submitTo(
			"https://arxiv.invalid/search/?query=quantum+gravity&searchtype=all&abstracts=show&order=-announced_date_first&size=50",
		);
	});

	it("honors an explicitly selected option instead of the first option", async () => {
		const search = await fixture(
			arxiv.replace(
				'<option value="title">',
				'<option value="title" selected>',
			),
			"https://arxiv.invalid/",
		);
		expect(controlValue(search.tree, search.byId("searchtype"))).toBe("title");
		await search.fill("stars");
		await search.submitTo(
			"https://arxiv.invalid/search/?query=stars&searchtype=title&abstracts=show&order=-announced_date_first&size=50",
		);
	});

	it("uses on for a checked radio without a value attribute", async () => {
		const search = await fixture(
			arxiv.replace('value="show" checked', "checked"),
			"https://arxiv.invalid/",
		);
		expect(controlValue(search.tree, search.byId("show"))).toBe("on");
		await search.fill("stars");
		await search.submitTo(
			"https://arxiv.invalid/search/?query=stars&searchtype=all&abstracts=on&order=-announced_date_first&size=50",
		);
	});

	it("omits a radio group when neither parsed radio is checked", async () => {
		const search = await fixture(
			arxiv.replace(" checked", ""),
			"https://arxiv.invalid/",
		);
		expect(controlChecked(search.tree, search.byId("show"))).toBe(false);
		expect(controlChecked(search.tree, search.byId("hide"))).toBe(false);
		await search.fill("stars");
		await search.submitTo(
			"https://arxiv.invalid/search/?query=stars&searchtype=all&order=-announced_date_first&size=50",
		);
	});

	it("includes a named button only when passed as the submitter", async () => {
		const search = await fixture();
		const submitters: (number | null)[] = [];
		const button = search.byId("submit");
		search.page.interactions.events.addEventListener(
			search.byId("search-form"),
			"submit",
			(event) => submitters.push((event as BrowserSubmitEvent).submitter),
		);
		await search.fill("native browser");
		await search.submitTo(
			"https://wikipedia.invalid/w/index.php?search=native+browser&title=Special%3ASearch&fulltext=Search",
			"submit",
		);
		expect(submitters).toEqual([button]);
	});

	it("orders input and bubbling submit events and awaits controlled listeners before serialization", async () => {
		const search = await fixture();
		const query = search.byId("query");
		const form = search.byId("search-form");
		const events = search.page.interactions.events;
		const trace: unknown[] = [];
		for (const type of ["beforeinput", "input"])
			events.addEventListener(query, type, (event) => {
				trace.push([
					type,
					event.target,
					event.bubbles,
					event.cancelable,
					controlValue(search.tree, query),
				]);
			});
		events.addEventListener(
			form,
			"submit",
			controlledEventListener(async (_target, event) => {
				await Promise.resolve();
				trace.push([
					"submit",
					event.target,
					event.bubbles,
					event.cancelable,
					(event as BrowserSubmitEvent).submitter,
				]);
				search.tree.setControl(query, { value: "listener value" });
			}),
		);
		events.addEventListener(search.tree.root, "submit", () => {
			trace.push(["root", controlValue(search.tree, query)]);
		});
		await search.fill("initial value");
		expect(search.requests).toHaveLength(1);
		await search.submitTo(
			"https://wikipedia.invalid/w/index.php?search=listener+value&title=Special%3ASearch",
		);
		expect(trace).toEqual([
			["beforeinput", query, true, true, ""],
			["input", query, true, false, "initial value"],
			["submit", form, true, true, null],
			["root", "listener value"],
		]);
	});

	it("closes the replaced tree and listeners, then closes the result and transport", async () => {
		const search = await fixture();
		const oldReference = search.reference("query");
		const closeOriginal = vi.fn();
		search.tree.onClose(closeOriginal);
		search.page.interactions.events.addEventListener(
			search.byId("query"),
			"input",
			() => {},
		);
		await search.fill("cleanup");
		await search.submitTo(
			"https://wikipedia.invalid/w/index.php?search=cleanup&title=Special%3ASearch",
		);
		expect(closeOriginal).toHaveBeenCalledTimes(1);
		expect(search.page.interactions.events.metrics()).toMatchObject({
			closed: true,
			listeners: 0,
			activeDispatches: 0,
		});
		expect(() => search.tree.resolve(oldReference)).toThrow(/closed/);
		const resultPage = search.session.page(search.tab.id);
		const closeResult = vi.fn();
		resultPage.document.onClose(closeResult);
		expect(resultPage.interactions.events.metrics().closed).toBe(false);
		expect(search.closeTransport).not.toHaveBeenCalled();
		search.session.close();
		expect(closeResult).toHaveBeenCalledTimes(1);
		expect(search.closeTransport).toHaveBeenCalledTimes(1);
		expect(resultPage.interactions.events.metrics().closed).toBe(true);
	});

	it("retains transport cleanup failures in native session metrics", async () => {
		const search = await fixture();
		search.closeTransport.mockImplementationOnce(() => {
			throw new Error("Synthetic cleanup failure");
		});
		search.session.close();
		expect(search.session.metrics()).toMatchObject({
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 1,
		});
		expect(search.tree.mutationMetrics().closed).toBe(true);
		expect(search.closeTransport).toHaveBeenCalledTimes(1);
	});

	it("keeps parsed scripts and inline handlers inert without fetching scripts", async () => {
		const search = await fixture(
			`${wikipedia.replace(
				'id="search-form"',
				'id="search-form" onsubmit="return false"',
			)}
<script>document.getElementById("title").value = "executed";</script>
<script src="https://scripts.invalid/unrequested.js"></script>`,
		);
		expect(htmlParseInfo(search.tree)).toMatchObject({ scripting: false });
		expect(controlValue(search.tree, search.byId("title"))).toBe(
			"Special:Search",
		);
		await search.fill("no scripts");
		await search.submitTo(
			"https://wikipedia.invalid/w/index.php?search=no+scripts&title=Special%3ASearch",
		);
	});

	it.each([
		[
			"hidden input",
			'<input id="query" type="hidden" name="q" value="original">',
		],
		["hidden control", '<input id="query" hidden name="q" value="original">'],
		[
			"inert ancestor",
			'<div inert><input id="query" name="q" value="original"></div>',
		],
		[
			"disabled control",
			'<input id="query" disabled name="q" value="original">',
		],
		[
			"disabled fieldset",
			'<fieldset disabled><input id="query" name="q" value="original"></fieldset>',
		],
	])(
		"refuses to fill a %s without events or another request",
		async (_name, control) => {
			const search = await fixture(
				`<!doctype html><form id="search-form" action="/search">${control}</form>`,
				"https://search.invalid/",
			);
			const inputEvents: string[] = [];
			for (const type of ["beforeinput", "input", "change", "submit"])
				search.page.interactions.events.addEventListener(
					search.tree.root,
					type,
					() => inputEvents.push(type),
				);
			await expect(search.fill("replacement")).rejects.toMatchObject({
				code: "not-actionable",
			});
			expect(controlValue(search.tree, search.byId("query"))).toBe("original");
			expect(inputEvents).toEqual([]);
			expect(search.requests).toHaveLength(1);
			expect(search.session.page(search.tab.id)).toBe(search.page);
			expect(search.tree.url).toBe("https://search.invalid/");
		},
	);

	it("stays on the original document when submit is prevented", async () => {
		const search = await fixture();
		const submits: string[] = [];
		search.page.interactions.events.addEventListener(
			search.byId("search-form"),
			"submit",
			(event) => {
				submits.push(event.type);
				event.preventDefault();
			},
		);
		await search.fill("stay here");
		const result = await search.submit();
		expect(result.form).toMatchObject({ canceled: true, invalid: [] });
		expect(result.navigation).toBeUndefined();
		expect(submits).toEqual(["submit"]);
		expect(search.requests).toHaveLength(1);
		expect(search.session.page(search.tab.id)).toBe(search.page);
		expect(search.tree.url).toBe("https://wikipedia.invalid/wiki/Main_Page");
		expect(controlValue(search.tree, search.byId("query"))).toBe("stay here");
		expect(search.page.interactions.events.metrics().closed).toBe(false);
	});

	it("blocks an empty required search before submit even when invalid is canceled", async () => {
		const search = await fixture(
			python.replace('id="query"', 'id="query" required'),
			"https://python.invalid/3/",
		);
		const trace: unknown[] = [];
		search.page.interactions.events.addEventListener(
			search.byId("query"),
			"invalid",
			(event) => {
				trace.push([event.type, event.bubbles, event.cancelable]);
				event.preventDefault();
			},
		);
		search.page.interactions.events.addEventListener(
			search.byId("search-form"),
			"submit",
			() => trace.push("submit"),
		);
		await search.fill("");
		const result = await search.submit();
		expect(result.form).toMatchObject({
			canceled: false,
			invalid: [
				{ reference: search.reference("query"), reason: "value-missing" },
			],
		});
		expect(result.navigation).toBeUndefined();
		expect(trace).toEqual([["invalid", false, true]]);
		expect(search.requests).toHaveLength(1);
		expect(search.session.page(search.tab.id)).toBe(search.page);
		expect(search.tree.url).toBe("https://python.invalid/3/");
	});
});
