import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

if (process.argv.length !== 3)
	throw new Error(
		"Supply the local WHATWG entities.json file documented in HTML-ENTITIES.md",
	);
const source = await readFile(process.argv[2]);
if (
	createHash("sha256").update(source).digest("hex") !==
	"d741d877ac77c4194c4ad526b5b4a19aef8dfe411ab840a466891cdbb9f362e6"
)
	throw new Error(
		"The named-character source does not match the reviewed snapshot",
	);
const data = JSON.parse(source.toString("utf8")) as Record<
	string,
	{ codepoints: number[]; characters: string }
>;
const rows = Object.keys(data)
	.sort()
	.map((key) => {
		const name = key.slice(1);
		const entry = data[key];
		if (
			!/^&[A-Za-z][A-Za-z0-9]*;?$/.test(key) ||
			String.fromCodePoint(...entry.codepoints) !== entry.characters
		)
			throw new Error("Invalid named-character record");
		const property = name.endsWith(";") ? JSON.stringify(name) : name;
		let value = JSON.stringify(entry.characters).replace(
			/[^\x20-\x7e]/g,
			(character) =>
				`\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
		);
		if (entry.characters === '"') value = `'"'`;
		return `\t\t${property}: ${value},`;
	});
process.stdout.write(
	`export const namedHtmlEntities: Readonly<Record<string, string>> =\n\tObject.freeze({\n${rows.join("\n")}\n\t});\n`,
);
