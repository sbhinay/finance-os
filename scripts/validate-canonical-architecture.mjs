import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "modules", "repositories", "services", "types", "utils"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const repositoryWritePattern =
  /transactionRepository\.(?:saveAll|add|update|delete)\s*\(/g;
const accountingDateFallbackPattern =
  /(?:date\s*\?\?\s*[^\n]*createdAt|createdAt\s*\?\?\s*[^\n]*date)/g;
const reconciliationSubtypePattern = /["']reconciliation["']/g;
const reconciliationCompatibilityFiles = new Set([
  "utils/recalculateBalances.ts",
  "utils/transactionNormalization.ts",
]);

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

const violations = [];
for (const sourceRoot of sourceRoots) {
  for (const file of collectFiles(path.join(root, sourceRoot))) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const source = fs.readFileSync(file, "utf8");

    for (const match of source.matchAll(repositoryWritePattern)) {
      if (relative !== "services/transactionPipeline.ts") {
        violations.push(
          `${relative}:${lineNumber(source, match.index)} bypasses the canonical transaction pipeline`
        );
      }
    }

    for (const match of source.matchAll(accountingDateFallbackPattern)) {
      if (relative !== "utils/transactionNormalization.ts") {
        violations.push(
          `${relative}:${lineNumber(source, match.index)} falls back from accounting date to createdAt`
        );
      }
    }

    for (const match of source.matchAll(reconciliationSubtypePattern)) {
      if (!reconciliationCompatibilityFiles.has(relative)) {
        violations.push(
          `${relative}:${lineNumber(source, match.index)} references the legacy reconciliation subtype outside compatibility cleanup`
        );
      }
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Canonical architecture validation passed.");
