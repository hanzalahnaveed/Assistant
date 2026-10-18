import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".next", "coverage"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(path.join(directory, entry.name));
    } else if (entry.name.endsWith(".d.ts")) {
      fs.rmSync(path.join(directory, entry.name), { force: true });
    }
  }
}
walk(root);

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  allowJs: true,
  resolveJsonModule: true,
  isolatedModules: true,
  sourceMap: false,
  inlineSourceMap: false,
};
function outputPath(file) {
  const relative = path.relative(root, file);
  if (relative === "next.config.ts") return path.join(root, "next.config.mjs");
  return file.replace(/\.tsx$/, ".jsx").replace(/\.ts$/, ".js");
}
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: options });
  const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const detail = errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error(`Could not convert ${path.relative(root, file)}:\n${detail}`);
  }
  let output = result.outputText;
  output = output.replace(/((?:from\s*|import\s*\()(["']))([^"']+)(\.tsx?)(["'])/g,
    (_match, prefix, _openingQuote, specifier, extension, closingQuote) =>
      prefix + specifier + (extension === ".tsx" ? ".jsx" : ".js") + closingQuote);
  const destination = outputPath(file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, output);
  fs.rmSync(file);
  console.log(`Converted ${path.relative(root, file)} -> ${path.relative(root, destination)}`);
}

const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
delete packageJson.devDependencies?.typescript;
delete packageJson.devDependencies?.["@types/node"];
delete packageJson.devDependencies?.["@types/react"];
delete packageJson.devDependencies?.["@types/react-dom"];
delete packageJson.scripts?.typecheck;
packageJson.scripts.lint = "node scripts/verify-javascript.mjs";
packageJson.scripts["verify:javascript"] = "node scripts/verify-javascript.mjs";
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n");
fs.rmSync(path.join(root, "tsconfig.json"), { force: true });
fs.rmSync(path.join(root, "next-env.d.ts"), { force: true });

const nextConfigPath = path.join(root, "next.config.mjs");
if (fs.existsSync(nextConfigPath)) {
  let config = fs.readFileSync(nextConfigPath, "utf8");
  config = config.replace(/^\s*typedRoutes:\s*true,?\s*$/m, "");
  fs.writeFileSync(nextConfigPath, config);
}
fs.writeFileSync(path.join(root, "jsconfig.json"), JSON.stringify({
  compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
  exclude: ["node_modules", ".next"]
}, null, 2) + "\n");
execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
console.log(`JavaScript migration complete: converted ${files.length} TypeScript files.`);
