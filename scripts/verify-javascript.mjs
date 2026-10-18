import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".next", "coverage"]);
const violations = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(root, fullPath);
    if (/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith(".d.ts")) violations.push(`TypeScript source remains: ${relative}`);
    if (/\.(?:js|jsx|mjs)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (/(?:from\s*|import\s*\()[\"'][^\"']+\.tsx?[\"']/.test(content)) violations.push(`TypeScript extension import remains: ${relative}`);
    }
  }
}
walk(root);
if (fs.existsSync(path.join(root, "tsconfig.json"))) violations.push("tsconfig.json remains; JavaScript projects should use jsconfig.json");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const dependency of ["typescript", "@types/node", "@types/react", "@types/react-dom"]) {
  if (manifest.dependencies?.[dependency] || manifest.devDependencies?.[dependency]) violations.push(`TypeScript dependency remains: ${dependency}`);
}
if (violations.length) { console.error(violations.join("\n")); process.exitCode = 1; }
else console.log("Verified: no TypeScript files, TypeScript imports, or TypeScript-only dependencies remain.");
