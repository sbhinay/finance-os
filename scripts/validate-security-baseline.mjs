import fs from "node:fs";
import { execFileSync } from "node:child_process";

const config = fs.readFileSync("next.config.ts", "utf8");
const scanner = fs.readFileSync("app/api/statement-scanner/route.ts", "utf8");
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

[
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
].forEach((header) => {
  if (!config.includes(header)) throw new Error(`Missing security header: ${header}`);
});

[
  "MAX_TOTAL_IMAGE_BYTES",
  "takeRateLimitToken",
  '"retry-after"',
  '"multipart/form-data"',
].forEach((guard) => {
  if (!scanner.includes(guard)) throw new Error(`Scanner API is missing guard: ${guard}`);
});

const forbiddenSecretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
];

for (const file of trackedFiles) {
  if (!/\.(?:ts|tsx|js|mjs|json|md|sql|ya?ml|example)$/i.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(source)) throw new Error(`Possible committed secret in ${file}`);
  }
}

console.log("Security baseline validated: headers, scanner limits, rate-limit foundation, and tracked-secret scan.");
