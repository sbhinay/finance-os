import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rootsToScan = ["app", "components", "docs", "lib", "modules", "scripts", "services", "types", "utils"];
const extensions = new Set([".css", ".js", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx"]);
const mojibakePattern = /[\u00e2\ufffd\u00c3\u00c2\u00f0]/g;

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

const findings = [];
for (const scanRoot of rootsToScan) {
  for (const file of collectFiles(path.join(root, scanRoot))) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const source = fs.readFileSync(file, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (mojibakePattern.test(line)) {
        findings.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
      mojibakePattern.lastIndex = 0;
    });
  }
}

if (findings.length) {
  console.error("Mojibake detected:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("Mojibake validation passed.");
