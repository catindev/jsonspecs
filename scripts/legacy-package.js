"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runNpm(args, options = {}) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_dry_run: "false" },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`npm ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
  return result.stdout.trim();
}

function createLegacyPackage({ root, outputDir, rulesDependency }) {
  const packageJson = readJson(path.join(root, "package.json"));
  if (packageJson.name !== "@jsonspecs/rules") {
    throw new Error(`expected root package name @jsonspecs/rules, got ${packageJson.name}`);
  }
  const version = packageJson.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("package.json version must be an explicit semver version");
  }

  const stageParent = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-legacy-"));
  const stage = path.join(stageParent, "package");
  fs.mkdirSync(stage);

  try {
    fs.cpSync(path.join(root, "schema"), path.join(stage, "schema"), { recursive: true });
    fs.copyFileSync(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
    fs.writeFileSync(path.join(stage, "index.js"), `"use strict";\n\nmodule.exports = require("@jsonspecs/rules");\n`);
    fs.writeFileSync(
      path.join(stage, "index.mjs"),
      `export * from "@jsonspecs/rules";\nexport { default } from "@jsonspecs/rules";\n`,
    );
    fs.writeFileSync(
      path.join(stage, "index.d.ts"),
      `export * from "@jsonspecs/rules";\nexport { default } from "@jsonspecs/rules";\n`,
    );
    fs.writeFileSync(
      path.join(stage, "README.md"),
      `# JSONSpecs compatibility package\n\nThe \`jsonspecs\` package now re-exports \`@jsonspecs/rules\`.\n\nNew projects should install \`@jsonspecs/rules\` directly:\n\n\`\`\`bash\nnpm install @jsonspecs/rules\n\`\`\`\n\nExisting imports from \`jsonspecs\` continue to work through this compatibility package.\n`,
    );

    const legacyPackageJson = {
      name: "jsonspecs",
      version,
      description: "Compatibility package for @jsonspecs/rules",
      type: "commonjs",
      main: "index.js",
      types: "./index.d.ts",
      exports: {
        ".": {
          types: "./index.d.ts",
          import: "./index.mjs",
          require: "./index.js",
          default: "./index.js",
        },
        "./package.json": "./package.json",
        "./schema": "./schema/artifact.schema.json",
        "./schema/artifact": "./schema/artifact.schema.json",
        "./schema/snapshot": "./schema/snapshot.schema.json",
      },
      files: [
        "index.js",
        "index.mjs",
        "index.d.ts",
        "schema/*.json",
        "README.md",
        "LICENSE",
      ],
      dependencies: {
        "@jsonspecs/rules": rulesDependency || `^${version}`,
      },
      keywords: packageJson.keywords,
      author: packageJson.author,
      license: packageJson.license,
      repository: packageJson.repository,
      bugs: packageJson.bugs,
      homepage: packageJson.homepage,
      engines: packageJson.engines,
      publishConfig: {
        access: "public",
      },
    };
    fs.writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(legacyPackageJson, null, 2)}\n`);

    fs.mkdirSync(outputDir, { recursive: true });
    const raw = runNpm([
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      outputDir,
      stage,
    ]);
    const result = JSON.parse(raw)[0];
    if (!result || !result.filename) throw new Error("npm pack did not report a tarball");
    return {
      tarball: path.resolve(outputDir, result.filename),
      filename: result.filename,
      integrity: result.integrity,
      version,
      rulesDependency: legacyPackageJson.dependencies["@jsonspecs/rules"],
    };
  } finally {
    fs.rmSync(stageParent, { recursive: true, force: true });
  }
}

module.exports = {
  createLegacyPackage,
  readJson,
  runNpm,
};
