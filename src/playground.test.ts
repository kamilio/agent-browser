import { expect, it } from "vitest";
import { playgroundHtml } from "./playground-assets.js";
import {
	parsePlaygroundCommand,
	playgroundConsole,
	playgroundNetwork,
	playgroundText,
	playgroundUrl,
} from "./playground.js";
import type { SessionRequests } from "./session.js";
import type { SemanticSnapshot } from "./snapshot.js";

it("renders scoped request metadata and clearly distinguishes failed navigation attempts", () => {
	const snapshot: SessionRequests = {
		partial: true,
		scope: "latest-network-navigation",
		tabId: "tab-1",
		navigation: 2,
		document: null,
		displayedDocument: "old-root",
		dropped: 1,
		retainedBytes: 256,
		maxBytes: 262144,
		maxEntries: 128,
		closed: false,
		entries: [
			{
				index: 0,
				kind: "document",
				method: "GET",
				url: "https://example.com/?redacted",
				state: "failed",
				elapsedMs: 4,
				error: "network-error",
			},
		],
	};
	const text = playgroundNetwork(snapshot);
	expect(text).toContain("navigation 2");
	expect(text).toContain("No document committed by this attempt");
	expect(text).toContain("displayed old-root");
	expect(text).toContain("dropped 1");
	expect(text).toContain("[failed/network-error]");
	expect(text).toContain("request 0");
	expect(
		playgroundNetwork({
			...snapshot,
			entries: [
				{
					...snapshot.entries[0],
					state: "complete",
					status: 204,
					cors: "blocked",
					error: undefined,
				},
			],
		}),
	).toContain("HTTP 204 · CORS blocked");
	expect(text).not.toContain("CORS");
	expect(
		playgroundNetwork({
			...snapshot,
			entries: [{ ...snapshot.entries[0], routeId: 7 }],
		}),
	).toContain("mock route 7");
	expect(
		playgroundNetwork({ ...snapshot, navigation: 0, entries: [] }),
	).toContain("No captured requests");
	expect(playgroundHtml).toContain('id="network-output"');
	expect(playgroundHtml).toContain('data-view="network"');
});

it("tokenizes CLI quoting without interpreting shell operators or expansion", () => {
	expect(parsePlaygroundCommand(`fill '#name' "two words"`)).toEqual([
		"fill",
		"#name",
		"two words",
	]);
	expect(parsePlaygroundCommand(`localstorage-set empty ''`)).toEqual([
		"localstorage-set",
		"empty",
		"",
	]);
	expect(parsePlaygroundCommand(`eval '$HOME; $(whoami)'`)).toEqual([
		"eval",
		"$HOME; $(whoami)",
	]);
	expect(parsePlaygroundCommand("fill target escaped\\ value")).toEqual([
		"fill",
		"target",
		"escaped value",
	]);
});

it.each(["", "fill '", "fill \\", "x".repeat(16_385), "x ".repeat(257)])(
	"rejects incomplete or excessive commands",
	(input) => {
		expect(() => parsePlaygroundCommand(input)).toThrow();
	},
);

it("normalizes public URLs without executing page markup", () => {
	expect(playgroundUrl(" example.com/path ")).toBe("https://example.com/path");
	expect(playgroundUrl("http://example.com/")).toBe("http://example.com/");
	const snapshot = {
		entries: [
			{ depth: 0, role: "text", ref: "e1", name: "<script>alert(1)</script>" },
		],
		truncated: true,
	} as SemanticSnapshot;
	expect(playgroundText(snapshot)).toContain("<script>alert(1)</script>");
	expect(playgroundText(snapshot)).toContain("snapshot truncated");
	expect(
		playgroundText({
			...snapshot,
			html: { partial: true, scripting: false, issues: 0 },
		}),
	).toContain("HTML partial; automatic JS off");
	expect(
		playgroundText({
			...snapshot,
			html: { partial: true, scripting: true, issues: 0 },
		}),
	).toContain("automatic JS enabled (partial)");
	expect(playgroundHtml).not.toContain("Bearer ");
});

it("renders actual console records as text and declares truncation", () => {
	const result = playgroundConsole({
		document: "e1",
		url: "https://example.com/",
		partial: true,
		started: true,
		sequence: 1,
		dropped: 2,
		cleared: 0,
		codeUnits: 10,
		limits: {
			maxEntries: 2,
			maxCodeUnits: 32,
			maxEntryCodeUnits: 16,
			maxFormatNodes: 4,
			maxDepth: 2,
			maxArguments: 4,
		},
		entries: [
			{
				sequence: 1,
				timeMs: 0,
				level: "error",
				source: "console",
				text: "<script>untrusted</script>",
				truncated: true,
			},
		],
	});
	expect(result).toContain("dropped 2");
	expect(result).toContain(
		"[error/console] <script>untrusted</script> [truncated]",
	);
	expect(playgroundHtml).toContain('id="console-output"');
	expect(playgroundHtml).toContain('id="html-output"');
	expect(playgroundHtml).toContain('id="download-html"');
});

it.each([
	"javascript:alert(1)",
	"file:///etc/passwd",
	"https://user:secret@example.com",
	"https://example.com/\n",
	"",
	"data:text/html,test",
])("rejects unsafe URL %s", (input) => {
	expect(() => playgroundUrl(input)).toThrow();
});
