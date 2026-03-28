# JSONSpecs

Declarative validation rules engine. Rules are JSON files. The engine compiles them, runs them against any payload, and returns structured results with `ERROR`, `WARNING`, and `EXCEPTION` levels, full issue list, and execution trace. Zero external dependencies.

```
npm install jsonspecs
```

## How it works

Rules are individual JSON files. A pipeline composes them into a scenario. The engine compiles them once and runs against any payload.

**Step 1: write atomic rules** (one file per rule):

`rules/library/person/first_name_required.json`

```json
{
  "id": "library.person.first_name_required",
  "type": "rule",
  "description": "First name must be filled",
  "role": "check",
  "operator": "not_empty",
  "level": "ERROR",
  "code": "PERSON.FIRST_NAME.REQUIRED",
  "message": "First name is required",
  "field": "person.firstName"
}
```

`rules/library/person/email_format.json`

```json
{
  "id": "library.person.email_format",
  "type": "rule",
  "description": "Email must contain @",
  "role": "check",
  "operator": "contains",
  "level": "WARNING",
  "code": "PERSON.EMAIL.FORMAT",
  "message": "Email address looks invalid",
  "field": "person.email",
  "value": "@"
}
```

`rules/library/person/doc_not_expired.json`

```json
{
  "id": "library.person.doc_not_expired",
  "type": "rule",
  "description": "Document must not be expired",
  "role": "check",
  "operator": "field_greater_or_equal_than_field",
  "level": "EXCEPTION",
  "code": "PERSON.DOC.EXPIRED",
  "message": "Document has expired",
  "field": "person.document.expireDate",
  "value_field": "$context.currentDate"
}
```

**Step 2: compose rules into a pipeline:**

`rules/pipelines/registration/pipeline.json`

```json
{
  "id": "registration.pipeline",
  "type": "pipeline",
  "description": "Person registration validation",
  "entrypoint": true,
  "strict": false,
  "required_context": ["currentDate"],
  "flow": [
    { "rule": "library.person.first_name_required" },
    { "rule": "library.person.email_format" },
    { "rule": "library.person.doc_not_expired" }
  ]
}
```

**Step 3: compile and run:**

```js
const { createEngine, Operators } = require("jsonspecs");

const artifacts = [
  require("./rules/library/person/first_name_required.json"),
  require("./rules/library/person/email_format.json"),
  require("./rules/library/person/doc_not_expired.json"),
  require("./rules/pipelines/registration/pipeline.json"),
];

const engine = createEngine({ operators: Operators });
const compiled = engine.compile(artifacts);

const result = engine.runPipeline(compiled, "registration.pipeline", {
  person: {
    firstName: "Ivan",
    email: "ivan@example.com",
    document: { expireDate: "2028-01-01" },
  },
  __context: { currentDate: "2026-03-27" },
});

// { status: "OK", control: "CONTINUE", issues: [] }
```

The engine is loader-agnostic artifacts can come from the filesystem, a snapshot file, a database, or inline objects in tests. See [Loading artifacts](#loading-artifacts).

## API

### `createEngine({ operators })`

Creates an engine instance bound to an operator pack.

```js
const { createEngine, Operators } = require("jsonspecs");
const engine = createEngine({ operators: Operators });
```

`Operators` is the built-in pack covering all standard checks and predicates. You can extend it with your own operators see [Custom operators](#custom-operators).

### `engine.compile(artifacts, options?)`

Compiles an array of artifact objects into an optimized runtime structure. Throws `CompilationError` with a full error list if any artifact is invalid.

```js
const compiled = engine.compile(artifacts, { sources });
```

Compile-time checks: schema validation, reference integrity, DAG cycle detection, operator existence, and `code` uniqueness across all rules. `sources` is an optional `Map<artifactId, sourceFile>` used to show file paths in error messages, populated automatically by `loadArtifactsFromDir`.

### `engine.runPipeline(compiled, pipelineId, payload)`

Runs a named pipeline against a payload.

```js
const result = engine.runPipeline(compiled, "registration.pipeline", {
  person: { firstName: "Иван" },
  __context: { currentDate: "2026-03-27" },
});
```

The payload can be a nested JSON object or a pre-flattened dot-notation map both work. Pass runtime context under the reserved `__context` key. Rules access it via `$context.fieldName`.

**Result shape:**

```js
{
  status: "OK" | "OK_WITH_WARNINGS" | "ERROR" | "EXCEPTION",
  control: "CONTINUE" | "STOP",
  issues: [
    {
      kind: "ISSUE",
      level: "ERROR" | "WARNING" | "EXCEPTION",
      code: "PERSON.FIRST_NAME.REQUIRED",
      message: "First name is required",
      field: "person.firstName",
      ruleId: "library.person.name_required",
      actual: "",       // value that caused the failure
      expected: ...     // rule's expected value or dictionary ref, if applicable
    }
  ]
}
```

### `deepGet(payload, field)`

Utility exported for use inside custom operators. Looks up a dot-notation field path in the flat payload map, with support for `$context.*` fields.

```js
const { deepGet } = require("jsonspecs");

// Returns { ok: true, value: "Иван" }
deepGet(ctx.payload, "person.firstName");

// Returns { ok: true, value: "2026-03-27" }
deepGet(ctx.payload, "$context.currentDate");

// Returns { ok: false, value: undefined } field absent
deepGet(ctx.payload, "person.unknownField");
```

### `CompilationError`

Thrown by `engine.compile()` when artifacts are invalid. Contains a full list of all errors found, not just the first one.

```js
const { CompilationError } = require("jsonspecs");

try {
  engine.compile(artifacts);
} catch (err) {
  if (err instanceof CompilationError) {
    console.error("Compilation failed:");
    err.errors.forEach((msg, i) => console.error(`  ${i + 1}. ${msg}`));
  }
}
```

## Loading artifacts

The engine is loader-agnostic. You decide how to bring artifacts into memory.

**From the filesystem** (development scan a directory of `.json` files):

```js
// loader-fs is part of your server project, not this package
const { loadArtifactsFromDir } = require("./lib/loader-fs");
const { artifacts, sources } = loadArtifactsFromDir("./rules");
const compiled = engine.compile(artifacts, { sources });
```

**From a snapshot** (production single pre-built JSON file):

```js
const snapshot = JSON.parse(fs.readFileSync("snapshot.json", "utf8"));
const compiled = engine.compile(snapshot.artifacts);
```

**Inline** (tests define artifacts as plain JS objects):

```js
const artifacts = [
  {
    id: "library.t.name",
    type: "rule",
    description: "Name must be filled",
    role: "check",
    operator: "not_empty",
    level: "ERROR",
    code: "NAME.REQUIRED",
    message: "Name is required",
    field: "person.name",
  },
  {
    id: "test.pipeline",
    type: "pipeline",
    description: "Test",
    entrypoint: true,
    strict: false,
    flow: [{ rule: "library.t.name" }],
  },
];

const compiled = engine.compile(artifacts);
const result = engine.runPipeline(compiled, "test.pipeline", {
  person: { name: "" },
});
// result.status === "ERROR"
// result.issues[0].code === "NAME.REQUIRED"
```

## Artifact types

| Type         | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| `rule`       | Atomic check or predicate one operator, one field, one outcome     |
| `condition`  | Conditional block: `when` predicate guard + `steps` to run if true |
| `pipeline`   | Ordered sequence of steps: rules, conditions, sub-pipelines        |
| `dictionary` | Named list of allowed values, used by `in_dictionary` operator     |

## Scoping rules

Artifact IDs control visibility between pipelines.

**`library.*` prefix** globally visible from any pipeline or condition:

```
library.person.email_format    ← usable anywhere
library.payment.card_required  ← usable anywhere
```

**Pipeline-local** visible within a pipeline when IDs share the same dotted prefix:

```
Pipeline:   internal.checkout.blocks.payment
Visible:    internal.checkout.blocks.payment.card_expiry_check
```

The compiler validates all references and reports every unresolvable one at compile time.

## Result levels

| Level       | Meaning                       | Pipeline behaviour                          |
| ----------- | ----------------------------- | ------------------------------------------- |
| `ERROR`     | Validation failure            | Accumulated, does **not** stop the pipeline |
| `WARNING`   | Soft check, data quality hint | Accumulated, does **not** stop the pipeline |
| `EXCEPTION` | Hard block, cannot proceed    | Immediately **stops** the pipeline          |

| `status`             | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `"OK"`               | No issues at all                                            |
| `"OK_WITH_WARNINGS"` | Passed, but has soft `WARNING`-level issues worth surfacing |
| `"ERROR"`            | One or more `ERROR`-level issues                            |
| `"EXCEPTION"`        | Pipeline was stopped by an `EXCEPTION`-level rule           |

## Custom operators

See the full guide in [OPERATORS.md](./OPERATORS.md).

Quick example adding a custom check operator:

```js
const { createEngine, Operators, deepGet } = require("jsonspecs");

const is_apple = (rule, ctx) => {
  const got = deepGet(ctx.payload, rule.field);
  if (!got.ok) return { status: "FAIL" };
  return {
    status: got.value === "apple" ? "OK" : "FAIL",
    actual: got.value,
  };
};

const operators = {
  check: { ...Operators.check, is_apple },
  predicate: { ...Operators.predicate },
};

const engine = createEngine({ operators });
```

Then use it in a rule artifact:

```json
{
  "id": "library.fruit.must_be_apple",
  "type": "rule",
  "description": "Field must equal apple",
  "role": "check",
  "operator": "is_apple",
  "level": "ERROR",
  "code": "FRUIT.NOT_APPLE",
  "message": "Only apples are accepted here",
  "field": "order.fruit"
}
```

## Built-in operators

Full reference with examples: [OPERATORS.md](./OPERATORS.md).

| Operator                            | Type              | Description                                        |
| ----------------------------------- | ----------------- | -------------------------------------------------- |
| `not_empty`                         | check + predicate | Field is present and non-empty                     |
| `is_empty`                          | check + predicate | Field is absent or empty                           |
| `equals`                            | check + predicate | Field equals `value`                               |
| `not_equals`                        | check + predicate | Field does not equal `value`                       |
| `matches_regex`                     | check + predicate | Field matches regex in `value`                     |
| `contains`                          | check + predicate | String contains substring `value`                  |
| `greater_than`                      | check + predicate | Field > `value`                                    |
| `less_than`                         | check + predicate | Field < `value`                                    |
| `in_dictionary`                     | check + predicate | Value exists in named dictionary                   |
| `field_equals_field`                | check + predicate | `field` == `value_field`                           |
| `field_not_equals_field`            | check + predicate | `field` != `value_field`                           |
| `field_less_than_field`             | check + predicate | `field` < `value_field`                            |
| `field_greater_than_field`          | check + predicate | `field` > `value_field`                            |
| `field_less_or_equal_than_field`    | check + predicate | `field` ≤ `value_field`                            |
| `field_greater_or_equal_than_field` | check + predicate | `field` ≥ `value_field`                            |
| `any_filled`                        | check             | At least one field from `fields` list is non-empty |
| `length_equals`                     | check             | String or array length equals `value`              |
| `length_max`                        | check             | String or array length ≤ `value`                   |
