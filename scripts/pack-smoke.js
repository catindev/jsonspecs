"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createLegacyPackage } = require("./legacy-package");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-pack-"));

function run(command, args, cwd = temp) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, npm_config_dry_run: "false" },
  });
}

function smokeConsumer({ packageName, tarball, schemaPackageName }) {
  const consumer = fs.mkdtempSync(path.join(temp, "consumer-"));
  run("npm", ["init", "-y"], consumer);
  run("npm", ["install", "--ignore-scripts", tarball], consumer);
  fs.writeFileSync(path.join(consumer, "smoke.cjs"), `
    const api = require("${packageName}");
    const artifactSchema = require("${schemaPackageName}/schema");
    const snapshotSchema = require("${schemaPackageName}/schema/snapshot");
    if (!artifactSchema.$defs || snapshotSchema.properties.format.const !== "jsonspecs-snapshot") process.exit(1);
    const artifacts = [
      { id: "library.required", type: "rule", description: "required", role: "check", operator: "not_empty", level: "ERROR", code: "X", message: "required", field: "x" },
      { id: "entry.main", type: "pipeline", description: "main", strict: false, entrypoint: true, flow: [{ rule: "library.required" }] }
    ];
    const engine = api.createEngine({ operators: api.Operators });
    const prepared = engine.compile(artifacts);
    const result = engine.runPipeline(prepared, { payload: { x: "" } });
    if (result.status !== "ERROR" || result.control !== "STOP") process.exit(1);
    if (!api.inspect(prepared).getArtifact("entry.main")) process.exit(1);
  `);
  run(process.execPath, ["smoke.cjs"], consumer);
  fs.writeFileSync(path.join(consumer, "smoke.mjs"), `
    import api, { createEngine, Operators, compileSnapshot, inspect } from "${packageName}";
    if (typeof createEngine !== "function" || !Operators || typeof compileSnapshot !== "function" || typeof inspect !== "function") process.exit(1);
    if (api.createEngine !== createEngine) process.exit(1);
  `);
  run(process.execPath, ["smoke.mjs"], consumer);
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], root));
  const rulesTarball = path.join(temp, packed[0].filename);
  smokeConsumer({
    packageName: "@jsonspecs/rules",
    tarball: rulesTarball,
    schemaPackageName: "@jsonspecs/rules",
  });
  const legacy = createLegacyPackage({
    root,
    outputDir: temp,
    rulesDependency: `file:${rulesTarball}`,
  });
  smokeConsumer({
    packageName: "jsonspecs",
    tarball: legacy.tarball,
    schemaPackageName: "jsonspecs",
  });
  console.log("@jsonspecs/rules and jsonspecs compatibility pack smoke OK");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
