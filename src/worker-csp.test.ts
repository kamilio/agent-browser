import { expect, it } from "vitest";
import { ContentSecurityPolicy } from "./content-security-policy.js";
import { bindDocumentResourceCsp } from "./document-resource-csp.js";
import { initializeDocumentScriptCsp } from "./document-script-csp.js";
import { parseHtmlDocument } from "./html-parser.js";

const documentUrl = "https://example.test/page";
const ownedBlob = "blob:https://example.test/owned";
it.each([
	[
		"worker-src blob:; child-src 'none'; script-src 'none'; default-src 'none'",
		true,
	],
	["worker-src 'none'; child-src blob:; script-src blob:", false],
	["child-src blob:; script-src 'none'", true],
	["child-src 'none'; script-src blob:", false],
	["script-src blob: 'unsafe-eval'", true],
	["script-src 'none'; default-src blob:", false],
	["default-src blob:", true],
	["worker-src *", false],
	["worker-src 'self'", true],
	["worker-src https:", false],
	["worker-src https://example.test", false],
	["worker-src 'none'; worker-src blob:", false],
])("enforces Worker fallback/Blob matching for %s", (policy, allowed) => {
	expect(
		new ContentSecurityPolicy(documentUrl, [policy], "worker").allows(
			ownedBlob,
		),
	).toBe(allowed);
});
it("intersects policies, checks foreign Blob origins and preserves ordinary destination restrictions", () => {
	expect(
		new ContentSecurityPolicy(
			documentUrl,
			["worker-src blob:", "worker-src 'none'"],
			"worker",
		).allows(ownedBlob),
	).toBe(false);
	expect(
		new ContentSecurityPolicy(
			documentUrl,
			["worker-src 'self'"],
			"worker",
		).allows("blob:https://foreign.test/id"),
	).toBe(false);
	for (const destination of ["image", "style", "connect"] as const)
		expect(
			new ContentSecurityPolicy(
				documentUrl,
				["default-src blob:"],
				destination,
			).allows(ownedBlob),
		).toBe(false);
	expect(
		new ContentSecurityPolicy(
			documentUrl,
			["worker-src 'self'"],
			"worker",
		).allows("https://example.test/worker.js"),
	).toBe(true);
});
it.each([
	"worker-src blob:; script-src 'unsafe-inline' 'unsafe-eval'",
	"script-src blob: 'unsafe-inline' 'unsafe-eval'",
	"child-src blob:; script-src 'unsafe-inline' 'unsafe-eval'",
])(
	"binds a native Worker policy and revokes it on document close: %s",
	(policy) => {
		const tree = parseHtmlDocument("<html><body></body></html>", documentUrl);
		try {
			const headers = { "content-security-policy": [policy] };
			const resource = bindDocumentResourceCsp(tree, headers);
			if (!resource) throw Error("Worker policy was not bound");
			expect(resource.supported).toBe(true);
			const scripts = initializeDocumentScriptCsp(tree, headers, true);
			if (!scripts) throw Error("Script policy was not bound");
			expect(scripts.unsupported).toBe(false);
			resource.attach(scripts);
			expect(() => resource.check("worker", ownedBlob)).not.toThrow();
			tree.close();
			expect(() => resource.check("worker", ownedBlob)).toThrow(/unavailable/i);
		} finally {
			tree.close();
		}
	},
);
it("permits secure owned Blob workers under upgrade-insecure-requests and blocks insecure source origins", () => {
	const tree = parseHtmlDocument("<html></html>", documentUrl);
	try {
		const headers = {
			"content-security-policy": [
				"worker-src blob:; upgrade-insecure-requests; script-src 'unsafe-inline'",
			],
		};
		const resource = bindDocumentResourceCsp(tree, headers);
		const scripts = initializeDocumentScriptCsp(tree, headers, true);
		if (!resource || !scripts) throw Error("Worker policy was not bound");
		resource.attach(scripts);
		expect(() => resource.check("worker", ownedBlob)).not.toThrow();
		expect(() =>
			resource.check("worker", "blob:http://example.test/id"),
		).toThrow(/secure/i);
	} finally {
		tree.close();
	}
});
