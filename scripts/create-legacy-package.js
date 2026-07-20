#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { createLegacyPackage } = require("./legacy-package");

const root = path.resolve(__dirname, "..");
const outputFlag = process.argv.indexOf("--output");
const outputDir = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.argv[outputFlag + 1])
  : path.join(root, ".artifacts");

const result = createLegacyPackage({ root, outputDir });
console.log(`[jsonspecs] legacy package: ${result.tarball}`);
console.log(`[jsonspecs] @jsonspecs/rules dependency: ${result.rulesDependency}`);
