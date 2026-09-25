import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

interface ImportEdge {
	from: string;
	specifier: string;
	kind: "import" | "export" | "dynamic";
}

interface BoundaryViolation {
	module: string;
	reason: string;
	path: readonly string[];
}

export function auditPortableCore(
	readSource: (module: string) => string,
	entry = "src/index.ts",
) {
	const modules = new Set<string>();
	const edges: ImportEdge[] = [];
	const violations: BoundaryViolation[] = [];
	const pending = [{ module: entry, path: [entry] }];
	while (pending.length) {
		const current = pending.pop();
		if (!current || modules.has(current.module)) continue;
		modules.add(current.module);
		const reject = (reason: string) => {
			violations.push({ module: current.module, reason, path: current.path });
		};
		if (!current.module.startsWith("src/") || !current.module.endsWith(".ts")) {
			reject("Module is outside the TypeScript core source boundary");
			continue;
		}
		let source: string;
		try {
			source = readSource(current.module);
		} catch {
			reject("Cannot read runtime module");
			continue;
		}
		const emitted = ts.transpileModule(source, {
			fileName: current.module,
			reportDiagnostics: true,
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
				verbatimModuleSyntax: true,
				isolatedModules: true,
			},
		});
		for (const diagnostic of emitted.diagnostics ?? []) {
			if (diagnostic.category === ts.DiagnosticCategory.Error)
				reject(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
		}
		const runtime = ts.createSourceFile(
			current.module.replace(/\.ts$/, ".js"),
			emitted.outputText,
			ts.ScriptTarget.ES2022,
			true,
			ts.ScriptKind.JS,
		);
		const addEdge = (
			expression: ts.Node | undefined,
			kind: ImportEdge["kind"],
		) => {
			if (
				!expression ||
				(!ts.isStringLiteral(expression) &&
					!ts.isNoSubstitutionTemplateLiteral(expression))
			) {
				reject(`Unresolved ${kind} module expression`);
				return;
			}
			const specifier = expression.text;
			edges.push({ from: current.module, specifier, kind });
			if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
				reject(`External runtime import: ${specifier}`);
				return;
			}
			if (!specifier.endsWith(".js") || /[?#\\]/.test(specifier)) {
				reject(`Unsupported runtime module specifier: ${specifier}`);
				return;
			}
			const target = posix.normalize(
				posix.join(
					posix.dirname(current.module),
					specifier.replace(/\.js$/, ".ts"),
				),
			);
			if (!target.startsWith("src/")) {
				reject(`Runtime import escapes core source: ${specifier}`);
				return;
			}
			pending.push({ module: target, path: [...current.path, target] });
		};
		const visit = (node: ts.Node) => {
			if (ts.isImportDeclaration(node)) addEdge(node.moduleSpecifier, "import");
			else if (ts.isExportDeclaration(node) && node.moduleSpecifier)
				addEdge(node.moduleSpecifier, "export");
			else if (ts.isCallExpression(node)) {
				if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
					addEdge(node.arguments[0], "dynamic");
				else if (
					ts.isIdentifier(node.expression) &&
					node.expression.text === "require"
				)
					reject("CommonJS require is not allowed in the portable ESM core");
			}
			ts.forEachChild(node, visit);
		};
		visit(runtime);
	}
	return {
		passed: violations.length === 0,
		modules: [...modules].sort(),
		edges,
		violations,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const packageRoot = resolve(process.argv[2] ?? process.cwd());
	const result = auditPortableCore((module) =>
		readFileSync(resolve(packageRoot, module), "utf8"),
	);
	console.log(
		JSON.stringify(
			{
				checkedAt: new Date().toISOString(),
				method:
					"TypeScript ES2022/ESNext verbatim emit followed by an AST runtime-import closure; modules are not executed",
				compilerVersion: ts.version,
				...result,
			},
			null,
			2,
		),
	);
	if (!result.passed) process.exitCode = 1;
}
