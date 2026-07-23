import { spawnSync } from "node:child_process";
import path from "node:path";

const fixturePath = path.resolve(
  process.argv[2] ?? "C:/Users/singha2/Downloads/FinanceOS_2026-06-29.json"
);
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = (scriptName) => npmCli ? [npmCli, "run", scriptName] : ["run", scriptName];

const steps = [
  ["Mojibake", process.execPath, ["scripts/validate-no-mojibake.mjs"]],
  ["Architecture", process.execPath, ["scripts/validate-canonical-architecture.mjs"]],
  ["Reports", process.execPath, ["--no-warnings", "--experimental-strip-types", "scripts/validate-report-exports.mjs"]],
  ["Cloud", process.execPath, ["scripts/validate-cloud-guards.mjs"]],
  ["Security baseline", process.execPath, ["scripts/validate-security-baseline.mjs"]],
  ["Authentication gate", process.execPath, ["scripts/validate-auth-gate.mjs"]],
  ["Import/export contract", process.execPath, ["scripts/validate-import-export-contract.mjs", fixturePath]],
  ["Scanner", process.execPath, ["--no-warnings", "--experimental-strip-types", "scripts/validate-statement-scanner.mjs"]],
  ["Debt reporting", process.execPath, ["--no-warnings", "--experimental-strip-types", "scripts/validate-debt-reporting.mjs"]],
  ["Debt projection", process.execPath, ["--no-warnings", "--experimental-strip-types", "scripts/validate-debt-projection.mjs"]],
  ["Properties", process.execPath, ["--no-warnings", "--experimental-strip-types", "scripts/validate-property-migration.mjs"]],
  ["Fixture replay", process.execPath, ["scripts/validate-finance-export.mjs", fixturePath]],
  ["Lint", npmCommand, npmArgs("lint")],
  ["Production build", npmCommand, npmArgs("build")],
];

for (const [label, command, args] of steps) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nProduction validation passed using fixture: ${fixturePath}`);
