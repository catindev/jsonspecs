/**
 * jsonspecs — Composable validation pipelines powered by JSON rules.
 * 
 * Public API (semver-stable):
 *   createEngine, Operators, CompilationError, deepGet
 *
 * Internal modules (src/**) are not part of the stable API and may change.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A single validation issue produced by a check rule. */
export interface Issue {
  /** Always "ISSUE" */
  kind: "ISSUE";
  /** Severity level */
  level: "WARNING" | "ERROR" | "EXCEPTION";
  /** Machine-readable error code from the rule artifact */
  code: string;
  /** Human-readable message from the rule artifact */
  message: string;
  /** Dot-notation field path the rule applied to */
  field: string | undefined;
  /** ID of the rule artifact that produced this issue */
  ruleId: string;
  /** Expected value (from rule.value or rule.dictionary), if applicable */
  expected?: unknown;
  /** Actual value found in the payload, if applicable */
  actual?: unknown;
  /** Compile-time step ID that triggered this issue */
  stepId?: string;
  /** Pipeline ID that owns the step */
  pipelineId?: string;
}

/** A single trace entry produced during pipeline execution. */
export interface TraceEntry {
  kind: "TRACE";
  message: string;
  data: Record<string, unknown>;
  ts: string; // ISO timestamp
}

/**
 * Result of runPipeline().
 *
 * status values:
 *   "OK"              — all checks passed
 *   "OK_WITH_WARNINGS"— all checks passed, but some WARNING-level issues were found
 *   "ERROR"           — one or more ERROR-level issues; pipeline ran to completion
 *   "EXCEPTION"       — an EXCEPTION-level issue stopped the pipeline early
 *   "ABORT"           — an unexpected runtime error occurred inside the engine itself;
 *                       issues[] contains whatever was accumulated before the abort;
 *                       error.message and error.stack describe the engine fault
 *
 * control values:
 *   "CONTINUE" — caller may proceed to next step
 *   "STOP"     — caller must not proceed (EXCEPTION or ERROR present)
 */
export type PipelineStatus = "OK" | "OK_WITH_WARNINGS" | "ERROR" | "EXCEPTION" | "ABORT";
export type PipelineControl = "CONTINUE" | "STOP";

export interface PipelineResult {
  status: PipelineStatus;
  control: PipelineControl;
  issues: Issue[];
  /** Execution trace. Present when trace option is not disabled. */
  trace: TraceEntry[];
  /** Only present when status === "ABORT" */
  error?: { message: string; stack?: string };
}

// ---------------------------------------------------------------------------
// Operator types
// ---------------------------------------------------------------------------

/** Context passed to every operator at runtime. */
export interface OperatorContext {
  /** Flat payload map. Use deepGet() to read values safely. */
  payload: Record<string, unknown>;
}

/** Internal result returned by a check operator. */
export interface CheckResult {
  status: "OK" | "FAIL" | "EXCEPTION";
  error?: Error;
  field?: string;
  actual?: unknown;
  failures?: Array<{ field: string; actual?: unknown }>;
}

/** Internal result returned by a predicate operator. */
export interface PredicateResult {
  status: "TRUE" | "FALSE" | "UNDEFINED" | "EXCEPTION";
  error?: Error;
}

export type CheckOperator = (rule: Record<string, unknown>, ctx: OperatorContext) => CheckResult;
export type PredicateOperator = (rule: Record<string, unknown>, ctx: OperatorContext) => PredicateResult;

export interface OperatorPack {
  check: Record<string, CheckOperator>;
  predicate: Record<string, PredicateOperator>;
}

// ---------------------------------------------------------------------------
// Engine types
// ---------------------------------------------------------------------------

/** Opaque compiled artifact bundle returned by engine.compile(). Detached from source artifact objects at compile time. */
export interface Compiled {
  readonly registry: Map<string, Record<string, unknown>>;
  readonly dictionaries: Map<string, Record<string, unknown>>;
  readonly operators: OperatorPack;
  readonly pipelines: Map<string, unknown>;
  readonly conditions: Map<string, unknown>;
}

/** Options for engine.compile() */
export interface CompileOptions {
  /** Source map for error reporting: artifact id → file path */
  sources?: Map<string, string>;
}

/** Options for engine.runPipeline() */
export interface RunOptions {
  /**
   * Set to false to skip trace collection (reduces memory overhead on hot paths).
   * Default: true.
   */
  trace?: boolean;
}

export interface Engine {
  /**
   * Compile an array of artifact objects into an executable bundle.
   * Throws CompilationError if any artifact is invalid.
   * Compile once, run many times.
   */
  compile(artifacts: Record<string, unknown>[], options?: CompileOptions): Compiled;

  /**
   * Execute a named pipeline against a payload.
   * Accepts both nested JSON ({ a: { b: 1 } }) and flat maps ({ "a.b": 1 }).
   * Never throws — runtime errors are returned as { status: "ABORT" }.
   */
  runPipeline(compiled: Compiled, pipelineId: string, payload: Record<string, unknown>, options?: RunOptions): PipelineResult;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an engine instance bound to an operator pack.
 *
 * @example
 * const { createEngine, Operators } = require('jsonspecs');
 * const engine = createEngine({ operators: Operators });
 */
export function createEngine(options: { operators: OperatorPack }): Engine;

/**
 * Built-in operator pack covering all standard check and predicate operators.
 * Pass to createEngine() or extend with your own operators.
 */
export const Operators: OperatorPack;

/**
 * Thrown by engine.compile() when artifacts contain errors.
 * Contains the full list of all errors found (not just the first one).
 *
 * @example
 * try {
 *   engine.compile(artifacts);
 * } catch (e) {
 *   if (e instanceof CompilationError) {
 *     e.errors.forEach(msg => console.error(msg));
 *   }
 * }
 */
export class CompilationError extends Error {
  /** All compilation error messages found across all phases. */
  readonly errors: string[];
  constructor(errors: string[]);
}

/**
 * Look up a dot-notation field path in a flat payload map.
 * Supports $context.* prefix for runtime context fields.
 * Exported as a stable helper for use inside custom operators.
 *
 * @example
 * const { ok, value } = deepGet(ctx.payload, 'person.firstName');
 * if (ok) { ... }
 */
export function deepGet(
  obj: Record<string, unknown>,
  path: string
): { ok: true; value: unknown } | { ok: false; value: undefined };
