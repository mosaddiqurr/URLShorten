import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  ".cache",
  ".netlify",
  ".data",
  "coverage",
  "test-results",
  "playwright-report",
  ".git",
]);
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
]);
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
];
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      failures.push(relative + ": symbolic link requires review");
      continue;
    }
    if (entry.isDirectory()) {
      await inspect(absolute);
      continue;
    }
    if (
      (entry.name.startsWith(".env") && entry.name !== ".env.example") ||
      /\.(?:db|sqlite|sqlite3|pem|key|p12|pfx|zip|log)(?:-|$)/i.test(entry.name)
    )
      failures.push(relative + ": private or generated file");
    if (
      !binaryExtensions.has(path.extname(entry.name)) &&
      (await stat(absolute)).size < 2_000_000
    ) {
      const contents = await readFile(absolute, "utf8");
      if (credentialPatterns.some((pattern) => pattern.test(contents)))
        failures.push(relative + ": credential-shaped content");
    }
  }
}
await inspect(root);
const ignore = await readFile(path.join(root, ".gitignore"), "utf8");
for (const rule of [
  "node_modules/",
  "dist/",
  ".env",
  ".data/",
  ".cache/",
  ".netlify/",
  "*.log",
  "qr-output/",
]) {
  if (!ignore.split(/\r?\n/).includes(rule))
    failures.push(".gitignore: missing " + rule);
}
for (const legacy of [
  "prisma",
  "src/app",
  "src/lib/analytics",
  "src/lib/monitor",
  ".claude",
  ".next",
]) {
  try {
    await stat(path.join(root, legacy));
    failures.push(legacy + ": obsolete artifact remains");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Publication check passed: no detected secrets, private files or obsolete source in publishable files.",
  );
