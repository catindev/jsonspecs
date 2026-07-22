"use strict";

/**
 * Ошибки публичных границ библиотеки.
 *
 * CompilationError относится к отказу снэпшота до исполнения. RuntimeAbort
 * используется только внутри рантайма и всегда превращается в нормативный
 * результат со status=ABORT, поэтому наружу из runPipeline не выбрасывается.
 */

const compilationErrors = new WeakSet();

class CompilationError extends Error {
  constructor(diagnostics, identifier = null) {
    const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    super(list[0]?.message || "Snapshot rejected");
    this.name = "CompilationError";
    this.diagnostics = list.map(normalizeDiagnostic);
    this.errors = this.diagnostics.map((item) => item.message);
    if (identifier) this.identifier = identifier;
    compilationErrors.add(this);
  }
}

function isCompilationError(value) {
  return compilationErrors.has(value);
}

// WeakSet является закрытой меткой внутреннего канала. Проверка по идентичности
// не вызывает ни одного Proxy trap и безопасна для любого выброшенного значения.
const runtimeAborts = new WeakSet();

class RuntimeAbort extends Error {
  constructor(code, details, message = null) {
    super(message || code);
    this.name = "RuntimeAbort";
    this.code = code;
    this.details = details;
    runtimeAborts.add(this);
  }
}

function isRuntimeAbort(value) {
  return runtimeAborts.has(value);
}

function normalizeDiagnostic(value) {
  if (typeof value === "string") return { code: "SNAPSHOT_REJECTED", message: value };
  return {
    code: value?.code || "SNAPSHOT_REJECTED",
    message: value?.message || "Snapshot rejected",
    ...(value?.path == null ? {} : { path: value.path }),
    ...(value?.artifactId == null ? {} : { artifactId: value.artifactId }),
  };
}

function reject(code, message, options = {}) {
  throw new CompilationError([{ code, message, ...options }], options.identifier || null);
}

function safeErrorString(value, property, fallback) {
  try {
    const result = value?.[property];
    return typeof result === "string" && result ? result : fallback;
  } catch (_) {
    return fallback;
  }
}

module.exports = {
  CompilationError,
  RuntimeAbort,
  isCompilationError,
  isRuntimeAbort,
  safeErrorString,
  reject,
};
