import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describeControl } from "../src/control-rendering.js";
import { documentFiles } from "../src/document-files.js";
import { documentGeometry } from "../src/document-geometry.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { buildFormattingTree } from "../src/formatting-tree.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { encodePng } from "../src/png.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const directory = process.argv[2];
if (process.argv.length !== 3 || !directory || !isAbsolute(directory))
	throw new Error("Provide one new absolute capture directory");
mkdirSync(directory, { mode: 0o700 });
const tree = parseHtmlDocument(
	`<style>
html,body{margin:0;padding:0;background-color:white;color:#182838;font-size:16px}
form{margin:16px}p{margin:8px 0 4px}input{font-size:16px;width:440px;height:28px;display:block}
#long{width:260px}
</style><form id="form"><p>Native file controls - synthetic metadata only</p>
<p>Single selection</p><input id="single" type="file">
<p>Multiple selection</p><input id="multiple" type="file" multiple>
<p>Disabled selection</p><input id="disabled" type="file" disabled>
<p>Clipped 255-character name</p><input id="long" type="file"></form>`,
	"https://fixture.invalid/file-control-capture",
);
const command = `node dist/scripts/capture-file-controls.js ${directory}`;
try {
	documentStyles(tree).setViewport(640, 320);
	const queries = new DocumentQueries(tree);
	const ids = ["single", "multiple", "disabled", "long"].map((name) => {
		const id = queries.querySelector(`#${name}`);
		if (id === null) throw new Error(`Missing ${name}`);
		return { name, id };
	});
	const captures = [];
	for (const phase of ["before", "selected", "cleared"]) {
		if (phase === "selected") {
			const owner = documentFiles(tree);
			for (const { name, id } of ids) {
				if (name === "disabled") tree.removeAttribute(id, "disabled");
				const names =
					name === "multiple"
						? ["first.txt", "second.txt", "third.txt"]
						: [
								name === "long"
									? `${"long-name-".repeat(25)}x.txt`
									: `${name}.txt`,
							];
				owner.replace(
					owner.capture(tree.reference(id)),
					names.map((filename) => ({
						name: filename,
						data: new Uint8Array([1, 2, 3]),
					})),
				);
				if (name === "disabled") tree.setAttribute(id, "disabled", "");
			}
		}
		if (phase === "cleared")
			for (const { id } of ids) documentFiles(tree).clear(id);
		const raster = rasterizeDocument(tree);
		const bytes = encodePng(raster.image);
		const filename = `${phase}.png`;
		writeFileSync(join(directory, filename), bytes, {
			flag: "wx",
			mode: 0o600,
		});
		captures.push({
			phase,
			filename,
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			width: raster.image.width,
			height: raster.image.height,
			metrics: raster.metrics,
			issues: buildFormattingTree(tree).issues,
			controls: ids.map(({ name, id }) => ({
				name,
				geometry: documentGeometry(tree).getBoundingClientRect(id),
				descriptor: describeControl(tree, id, 16),
			})),
		});
	}
	writeFileSync(
		join(directory, "evidence.json"),
		`${JSON.stringify({ command, generatedAt: new Date().toISOString(), source: "synthetic-native-document", chooser: false, runtime: false, captures }, null, 2)}\n`,
		{ flag: "wx", mode: 0o600 },
	);
	console.log(
		JSON.stringify(
			{
				directory,
				command,
				captures: captures.map(({ phase, bytes, width, height }) => ({
					phase,
					bytes,
					width,
					height,
				})),
			},
			null,
			2,
		),
	);
} finally {
	tree.close();
}
