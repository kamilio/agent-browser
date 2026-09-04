import { expect, it } from "vitest";
import {
	documentMode,
	doctypeMode,
	setDocumentMode,
	type DocumentMode,
} from "./document-mode.js";
import type { HtmlDoctypeToken } from "./html-doctype.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { htmlParseInfo } from "./html-info.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

function token(
	publicId: string | null,
	systemId: string | null = null,
): HtmlDoctypeToken {
	return {
		kind: "doctype",
		name: "html",
		publicId,
		systemId,
		forceQuirks: false,
	};
}

const publicCases: readonly [string | null, DocumentMode][] = [
	[null, "no-quirks"],
	["", "no-quirks"],
	["unknown", "no-quirks"],
	["-//W3C//DTD HTML 4.01//EN", "no-quirks"],
	["-//W3C//DTD XHTML 1.0 Strict//EN", "no-quirks"],
	["html", "quirks"],
	["HTML suffix", "no-quirks"],
	["-//W3O//DTD W3 HTML Strict 3.0//EN//", "quirks"],
	["-/W3C/DTD HTML 4.0 Transitional/EN", "quirks"],
	["+//Silmaril//dtd html Pro v0r11 19970101//EN", "quirks"],
	["-//IETF//DTD HTML 2.0 Strict Level 1//EN", "quirks"],
	["-//IETF//DTD HTML Strict Level 3//EN", "quirks"],
	["-//Microsoft//DTD Internet Explorer 3.0 Tables//EN", "quirks"],
	["-//Netscape Comm. Corp.//DTD Strict HTML//EN", "quirks"],
	["-//O'Reilly and Associates//DTD HTML Extended Relaxed 1.0//EN", "quirks"],
	[
		"-//SoftQuad//DTD HoTMetaL PRO 4.0::19971010::extensions to HTML 4.0//EN",
		"quirks",
	],
	["-//Sun Microsystems Corp.//DTD HotJava HTML//EN", "quirks"],
	["-//W3C//DTD HTML 3.2S Draft//EN", "quirks"],
	["-//W3C//DTD HTML 4.0 Transitional//EN", "quirks"],
	["-//WebTechs//DTD Mozilla HTML//EN", "quirks"],
	["-//W3C//DTD XHTML 1.0 Transitional//EN", "limited-quirks"],
	["-//W3C//DTD XHTML 1.0 Frameset//EN", "limited-quirks"],
];
for (const [publicId, mode] of publicCases)
	it(`classifies the public identifier ${String(publicId)}`, () => {
		expect(doctypeMode(token(publicId))).toBe(mode);
		if (publicId !== null)
			expect(doctypeMode(token(publicId.toLowerCase()))).toBe(mode);
	});

for (const kind of ["Frameset", "Transitional"])
	for (const systemId of [null, "", "system.dtd"])
		it(`distinguishes HTML 4.01 ${kind} with system ${String(systemId)}`, () => {
			expect(
				doctypeMode(token(`-//W3C//DTD HTML 4.01 ${kind}//EN`, systemId)),
			).toBe(systemId ? "limited-quirks" : "quirks");
		});

it("gives force-quirks, a non-HTML name and the IBM system identifier precedence", () => {
	const limited = token("-//W3C//DTD XHTML 1.0 Transitional//EN");
	expect(doctypeMode({ ...limited, forceQuirks: true })).toBe("quirks");
	expect(doctypeMode({ ...limited, name: "svg" })).toBe("quirks");
	expect(doctypeMode({ ...limited, name: null })).toBe("quirks");
	expect(
		doctypeMode({
			...limited,
			systemId: "HTTP://WWW.IBM.COM/DATA/DTD/V11/IBMXHTML1-TRANSITIONAL.DTD",
		}),
	).toBe("quirks");
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const result = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(result, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		return result;
	},
};

for (const [source, mode] of [
	["", "quirks"],
	["<!--comment-->\n", "quirks"],
	["<p>text", "quirks"],
	["<!doctype html><p>text", "no-quirks"],
	['<!doctype html SYSTEM "about:legacy-compat">', "no-quirks"],
	[
		'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">',
		"limited-quirks",
	],
] as const)
	it(`exposes immutable parsed mode metadata for ${source}`, () => {
		const tree = parseHtmlDocument(source, "https://example.com");
		try {
			const document = new ScriptDom(tree, factory).document as {
				compatMode: string;
			};
			expect(documentMode(tree)).toBe(mode);
			expect(htmlParseInfo(tree)?.mode).toBe(mode);
			expect(document.compatMode).toBe(
				mode === "quirks" ? "BackCompat" : "CSS1Compat",
			);
			if (mode !== "no-quirks")
				expect(
					htmlParseInfo(tree)?.issues[`${mode}-layout-not-implemented`],
				).toBe(1);
			expect(Object.isFrozen(htmlParseInfo(tree))).toBe(true);
		} finally {
			tree.close();
		}
	});

it("does not recompute mode after programmatic doctype changes", () => {
	const tree = parseHtmlDocument(
		'<!doctype html PUBLIC "html">',
		"https://example.com",
	);
	const doctype = tree.get(tree.root).children[0];
	tree.remove(doctype);
	tree.insert(
		tree.root,
		tree.createDocumentType("html"),
		tree.get(tree.root).children[0],
	);
	expect(documentMode(tree)).toBe("quirks");
	tree.close();
});

it("defaults new native documents to no-quirks and rejects invalid or closed access", () => {
	const tree = new DocumentTree("about:blank");
	expect(documentMode(tree)).toBe("no-quirks");
	expect(() => setDocumentMode(tree, "other" as DocumentMode)).toThrow(
		"Invalid document compatibility mode",
	);
	const document = new ScriptDom(tree, factory).document as {
		compatMode: string;
	};
	expect(document.compatMode).toBe("CSS1Compat");
	tree.close();
	expect(() => documentMode(tree)).toThrow("closed");
	expect(() => document.compatMode).toThrow("closed");
});
