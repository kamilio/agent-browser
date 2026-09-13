import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	parseResearchArguments,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { parseResearchReplayArguments } from "../scripts/research-replay-cli.js";
import { parseHtmlDocument } from "./html-parser.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	DocumentQueries,
	supportsCssSelector,
	validateSelectorSyntax,
} from "./selectors.js";
import { BrowserSession } from "./session.js";

const url = "https://preflight.fixture.invalid/research";
const validateTargets = validateSelectorSyntax as (
	source: string,
	options: { pseudoElements?: boolean },
) => void;
const pseudoTargets = [
	"h2::before",
	"h2::after",
	"h2:before",
	"h2:after",
	"h2::BeFoRe",
	String.raw`h2::\62 efore`,
	String.raw`h2:\61 fter`,
	"h1, h2::before",
	"h2::after, h1",
	"h2:is(h2,h3)::before",
	"main > h2::after",
	"::before",
];
const elementTargets = [
	"h1, h2",
	'h2[title="::before"]',
	'h2[data-note=":after"]',
	String.raw`#heading\:\:before`,
	String.raw`.label\:after`,
	String.raw`h2[title="\3a \3a before"]`,
	'h2:is(h2, h3):not([title="::after"])',
	'main:has(> h2[title="::before"])',
	'main > h2:nth-child(2 of [title="::before"])',
];
const replayFlags = [
	"--expected-profile",
	"default",
	"--receipt-sha256",
	"a".repeat(64),
	"--body-sha256",
	"b".repeat(64),
	"--body-bytes",
	"64",
];
const trusted: admission.TrustedResearchReplayAdmission = {
	expectedProfile: "default",
	expectedReceiptSha256: "a".repeat(64),
	expectedBody: { bytes: 64, sha256: "b".repeat(64) },
};

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		() => {
			throw new Error("Unexpected receipt admission");
		},
	);
});
afterEach(() => vi.restoreAllMocks());

function expectNoSetup() {
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(admission.validateResearchReplayAdmission).not.toHaveBeenCalled();
}

it.each(pseudoTargets)(
	"rejects parsed pseudo target %s only in element-only syntax mode",
	(selector) => {
		expect(() => validateSelectorSyntax(selector)).not.toThrow();
		expect(() =>
			validateTargets(selector, { pseudoElements: true }),
		).not.toThrow();
		expect(() =>
			validateTargets(selector, { pseudoElements: false }),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
		expectNoSetup();
	},
);

it.each(
	pseudoTargets.flatMap((target) => [
		{ mode: "selector" as const, target },
		{ mode: "section" as const, target },
	]),
)(
	"rejects $mode $target in navigation and replay before setup or admission",
	async ({ mode, target }) => {
		expect(() =>
			parseResearchArguments([url, `--${mode}`, target]),
		).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid research selector",
			}),
		);
		await expect(
			researchNavigation(
				url,
				false,
				undefined,
				mode === "selector" ? target : undefined,
				false,
				undefined,
				mode === "section" ? target : undefined,
			),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid research selector",
		});
		expect(() =>
			parseResearchReplayArguments([...replayFlags, `--${mode}`, target]),
		).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid research replay arguments",
			}),
		);
		const selection =
			mode === "selector" ? { selector: target } : { section: target };
		expect(() =>
			extractResearchReplayJson(new Uint8Array(), trusted, selection),
		).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid research replay selection",
			}),
		);
		expectNoSetup();
	},
);

it.each(elementTargets)(
	"keeps valid element target and literal pseudo text %s",
	(target) => {
		expect(() =>
			validateTargets(target, { pseudoElements: false }),
		).not.toThrow();
		for (const mode of ["selector", "section"] as const) {
			expect(parseResearchArguments([url, `--${mode}`, target])[mode]).toBe(
				target,
			);
			expect(
				parseResearchReplayArguments([...replayFlags, `--${mode}`, target])
					.selection,
			).toEqual({ [mode]: target });
		}
		expectNoSetup();
	},
);

it.each([
	":is(h2::before)",
	"main:has(> h2::after)",
	"h2:nth-child(1 of h2::before)",
])("retains existing nested pseudo rejection for %s", (selector) => {
	expect(() => validateSelectorSyntax(selector)).toThrow();
	expect(() => validateTargets(selector, { pseudoElements: false })).toThrow();
	expectNoSetup();
});

it.each([
	{ selector: "x".repeat(8193), message: "text limit" },
	{ selector: ".part".repeat(257), message: "component limit" },
])(
	"retains the bounded parser's $message in element-only mode",
	({ selector, message }) => {
		expect(() => validateTargets(selector, { pseudoElements: false })).toThrow(
			message,
		);
		expectNoSetup();
	},
);

it("does not change native DOM query or generated CSS matching semantics", () => {
	const tree = parseHtmlDocument(
		'<h2 id="heading::before" title="::before">Title</h2>',
		url,
	);
	const queries = new DocumentQueries(tree);
	try {
		const heading = queries.querySelector("h2");
		expect(heading).not.toBeNull();
		expect(queries.querySelectorAll("h2::before")).toEqual([]);
		expect(queries.querySelectorAll("h2, h2::before")).toEqual([heading]);
		expect(queries.querySelector(String.raw`#heading\:\:before`)).toBe(heading);
		expect(queries.querySelector('[title="::before"]')).toBe(heading);
		expect([
			...queries.matchingPseudoSpecificities("h2::before", "before").keys(),
		]).toEqual([heading]);
		expect(supportsCssSelector("h2::before")).toBe(true);
	} finally {
		queries.close();
		tree.close();
	}
	expectNoSetup();
});

it.each(["::before", ":after"])(
	"does not apply CSS target restrictions to link search text %s",
	(target) => {
		expect(
			parseResearchReplayArguments([...replayFlags, "--links", target])
				.selection,
		).toEqual({ links: target });
		expectNoSetup();
	},
);

it.each(["selector", "section"] as const)(
	"redacts rejected %s values at every research boundary",
	async (mode) => {
		const target = '[data-private="SYNTHETIC_PRIVATE_TARGET"]::before';
		const operations = [
			() => parseResearchArguments([url, `--${mode}`, target]),
			() =>
				researchNavigation(
					url,
					false,
					undefined,
					mode === "selector" ? target : undefined,
					false,
					undefined,
					mode === "section" ? target : undefined,
				),
			() => parseResearchReplayArguments([...replayFlags, `--${mode}`, target]),
			() =>
				extractResearchReplayJson(
					new Uint8Array(),
					trusted,
					mode === "selector" ? { selector: target } : { section: target },
				),
		];
		for (const operation of operations) {
			let rejected = false;
			try {
				await operation();
			} catch (error) {
				rejected = true;
				expect(error).toMatchObject({ code: "invalid-input" });
				expect(String(error)).not.toContain("SYNTHETIC_PRIVATE_TARGET");
			}
			expect(rejected).toBe(true);
		}
		expectNoSetup();
	},
);
