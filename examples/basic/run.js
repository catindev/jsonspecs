/**
 * Runnable smoke test: the exact example from README.
 * Usage: node examples/basic/run.js
 */

"use strict";

const { createEngine, Operators, CompilationError } = require("../..");

//  Step 1: define rules as plain objects (normally loaded from JSON files)

const artifacts = [
  {
    id: "library.person.first_name_required",
    type: "rule",
    description: "First name must be filled",
    role: "check",
    operator: "not_empty",
    level: "ERROR",
    code: "PERSON.FIRST_NAME.REQUIRED",
    message: "First name is required",
    field: "person.firstName",
  },
  {
    id: "library.person.email_format",
    type: "rule",
    description: "Email must contain @",
    role: "check",
    operator: "contains",
    level: "WARNING",
    code: "PERSON.EMAIL.FORMAT",
    message: "Email address looks invalid",
    field: "person.email",
    value: "@",
  },
  {
    id: "library.person.doc_not_expired",
    type: "rule",
    description: "Document must not be expired",
    role: "check",
    operator: "field_greater_or_equal_than_field",
    level: "EXCEPTION",
    code: "PERSON.DOC.EXPIRED",
    message: "Document has expired",
    field: "person.document.expireDate",
    value_field: "$context.currentDate",
  },
  {
    id: "registration.pipeline",
    type: "pipeline",
    description: "Person registration validation",
    entrypoint: true,
    strict: false,
    required_context: ["currentDate"],
    flow: [
      { rule: "library.person.first_name_required" },
      { rule: "library.person.email_format" },
      { rule: "library.person.doc_not_expired" },
    ],
  },
];

//  Step 2: compile once ────────────────────────────────────────────────────

const engine = createEngine({ operators: Operators });

let compiled;
try {
  compiled = engine.compile(artifacts);
} catch (e) {
  if (e instanceof CompilationError) {
    console.error("Compilation failed:");
    e.errors.forEach((msg) => console.error(" -", msg));
    process.exit(1);
  }
  throw e;
}

//  Step 3: run ─────────────────────────────────────────────────────────────

const result = engine.runPipeline(compiled, "registration.pipeline", {
  person: {
    firstName: "",
    email: "not-an-email",
    document: { expireDate: "2099-01-01" },
  },
  __context: { currentDate: "2024-01-01" },
});

console.log("status:", result.status);
console.log("control:", result.control);
console.log("issues:");
result.issues.forEach((i) =>
  console.log(" -", `[${i.level}]`, i.code, "→", i.message),
);

//  Assertions ──────────────────────────────────────────────────────────────

const assert = require("node:assert/strict");
assert.equal(result.status, "ERROR");
assert.equal(result.control, "STOP");
assert.ok(result.issues.some((i) => i.code === "PERSON.FIRST_NAME.REQUIRED"));
assert.ok(
  result.issues.some(
    (i) => i.code === "PERSON.EMAIL.FORMAT" && i.level === "WARNING",
  ),
);

console.log("\n✓ Smoke test passed");
