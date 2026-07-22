"use strict";

/** Проверяет, что локальный корпус фикстур побайтно взят из закреплённого commit spec. */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const pinFile = path.join(root, "tests", "conformance", "spec-commit.txt");
const expectedCommit = fs.readFileSync(pinFile, "utf8").trim();
if (!/^[0-9a-f]{40}$/.test(expectedCommit)) fail("spec-commit.txt must contain one full lowercase Git commit");

const specRoot = resolveSpecRoot();
const actualCommit = git(specRoot, ["rev-parse", "HEAD"]).trim();
if (actualCommit !== expectedCommit)
  fail(`spec checkout is ${actualCommit}, expected ${expectedCommit}`);

const expectedRoot = path.join(specRoot, "fixtures");
const actualRoot = path.join(root, "tests", "conformance", "fixtures");
const expectedFiles = files(expectedRoot);
const actualFiles = files(actualRoot);
if (expectedFiles.length !== actualFiles.length || expectedFiles.some((file, index) => file !== actualFiles[index]))
  fail(describeFileSetDifference(expectedFiles, actualFiles));

for (const file of expectedFiles) {
  const expected = fs.readFileSync(path.join(expectedRoot, file));
  const actual = fs.readFileSync(path.join(actualRoot, file));
  if (!expected.equals(actual)) fail(`fixture differs from pinned spec: ${file}`);
}

const fixtureCount = expectedFiles.filter((file) => file.endsWith(".json")).length;
console.log(`OK: ${fixtureCount} fixtures match jsonspecs/spec@${expectedCommit}`);

function resolveSpecRoot() {
  const explicit = process.argv[2] || process.env.JSONSPECS_SPEC_DIR;
  const candidates = explicit
    ? [path.resolve(explicit)]
    : [path.join(root, ".conformance-spec"), path.resolve(root, "..", "spec")];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, ".git")));
  if (!found) fail(`spec checkout not found; checked: ${candidates.join(", ")}`);
  return found;
}

function files(directory, prefix = "") {
  if (!fs.existsSync(directory)) fail(`fixture directory not found: ${directory}`);
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...files(path.join(directory, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
    else fail(`unsupported fixture entry: ${relative}`);
  }
  return out;
}

function describeFileSetDifference(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((file) => !actualSet.has(file));
  const extra = actual.filter((file) => !expectedSet.has(file));
  return `fixture file set differs from pinned spec; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`;
}

function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (_) { fail(`cannot inspect spec checkout at ${cwd}`); }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
