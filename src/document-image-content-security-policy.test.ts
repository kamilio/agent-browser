import { afterEach, expect, it } from "vitest";
import {
	documentImageContentSecurityPolicy,
	imageContentSecurityPolicyValues,
} from "./document-image-content-security-policy.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(html = "<main></main>") {
	const tree = parseHtmlDocument(html, "https://example.com/page");
	trees.push(tree);
	return tree;
}

it("collects enforcing header fields without treating report-only as enforcing", () => {
	expect(
		imageContentSecurityPolicyValues({
			"Content-Security-Policy": ["img-src 'self'"],
			"content-security-policy": ["default-src https:"],
			"content-security-policy-report-only": ["img-src 'none'"],
		}),
	).toEqual(["img-src 'self'", "default-src https:"]);
});

it("shares one configured owner and rejects replacement with a weaker policy", () => {
	const tree = fixture();
	const values = ["img-src 'self'"];
	const policy = documentImageContentSecurityPolicy(tree, values);
	expect(documentImageContentSecurityPolicy(tree, [...values])).toBe(policy);
	values[0] = "img-src *";
	expect(() => policy.check("https://other.example/a.png")).toThrow(
		"Image blocked by Content Security Policy",
	);
	expect(() => documentImageContentSecurityPolicy(tree, values)).toThrow(
		"already configured",
	);
	expect(() => policy.check("https://example.com/a.png")).not.toThrow();
});

it("keeps existing meta policy denial after the observed node is removed", () => {
	const tree = fixture(
		'<meta http-equiv="Content-Security-Policy" content="img-src *"><main></main>',
	);
	const policy = documentImageContentSecurityPolicy(tree, ["img-src 'self'"]);
	const meta = [...tree.walk()].find(
		({ node }) => node.tagName === "meta",
	)?.node;
	if (!meta) throw new Error("Missing metadata fixture");
	tree.remove(meta.id);
	expect(() => policy.check("https://example.com/a.png")).toThrow(
		"Meta image CSP enforcement is not implemented",
	);
});

it("observes insertion before synchronous removal can erase an unsupported policy", () => {
	const tree = fixture();
	const policy = documentImageContentSecurityPolicy(tree, ["img-src 'self'"]);
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "img-src 'none'",
	});
	expect(() => policy.check("https://example.com/a.png")).not.toThrow();
	tree.append(tree.root, meta);
	tree.remove(meta);
	expect(() => policy.check("https://example.com/a.png")).toThrow(
		"Meta image CSP",
	);
});

it("observes metadata attributes without allowing subsequent edits to remove the guard", () => {
	const tree = fixture();
	const policy = documentImageContentSecurityPolicy(tree, []);
	const meta = tree.createElement("meta", { content: "img-src 'none'" });
	tree.append(tree.root, meta);
	tree.setAttribute(meta, "http-equiv", "CONTENT-SECURITY-POLICY");
	tree.removeAttribute(meta, "http-equiv");
	tree.setAttribute(meta, "content", "img-src *");
	expect(() => policy.check("https://example.com/a.png")).toThrow(
		"Meta image CSP",
	);
});

it("detects policy metadata within an inserted subtree", () => {
	const tree = fixture();
	const policy = documentImageContentSecurityPolicy(tree, []);
	const container = tree.createElement("div");
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "img-src 'none'",
	});
	tree.append(container, meta);
	expect(() => policy.check("https://example.com/a.png")).not.toThrow();
	tree.append(tree.root, container);
	expect(() => policy.check("https://example.com/a.png")).toThrow(
		"Meta image CSP",
	);
});

it("does not treat detached or report-only metadata as a newly enforcing policy", () => {
	const tree = fixture();
	const policy = documentImageContentSecurityPolicy(tree, []);
	tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "img-src 'none'",
	});
	tree.append(
		tree.root,
		tree.createElement("meta", {
			"http-equiv": "content-security-policy-report-only",
			content: "img-src 'none'",
		}),
	);
	expect(() => policy.check("https://example.com/a.png")).not.toThrow();
});

it("fails closed after bounded metadata observation work is exhausted", () => {
	const tree = fixture();
	let parent = tree.root;
	for (let depth = 0; depth < 240; depth++) {
		const element = tree.createElement("div");
		tree.append(parent, element);
		parent = element;
	}
	const meta = tree.createElement("meta");
	tree.append(parent, meta);
	const policy = documentImageContentSecurityPolicy(tree, []);
	for (let index = 0; index < 10_000; index++)
		tree.setAttribute(meta, "data-index", String(index));
	expect(() => policy.check("https://example.com/a.png")).toThrow(
		"Image CSP metadata work limit exceeded",
	);
});

it("ignores long non-CSP pragma values without treating them as policies", () => {
	const tree = fixture();
	const meta = tree.createElement("meta", { "http-equiv": "X".repeat(65_536) });
	tree.append(tree.root, meta);
	const policy = documentImageContentSecurityPolicy(tree, ["img-src 'self'"]);
	for (let index = 0; index < 32; index++)
		tree.setAttribute(meta, "data-index", String(index));
	expect(() => policy.check("https://example.com/a.png")).not.toThrow();
});

it("closes policy ownership with its document", () => {
	const tree = fixture();
	const policy = documentImageContentSecurityPolicy(tree, ["img-src 'self'"]);
	tree.close();
	expect(() => policy.check("https://example.com/a.png")).toThrow("closed");
	expect(() => policy.matches(["img-src 'self'"])).toThrow("closed");
	expect(() => policy.close()).not.toThrow();
});
