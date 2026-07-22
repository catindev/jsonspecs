"use strict";

/**
 * Закрытый индекс справочников.
 *
 * Массив entries остаётся частью нормативного invocation для внешних операторов,
 * а встроенные операторы проверяют принадлежность через индекс, созданный во
 * время компиляции. WeakMap не меняет публичную форму prepared-снэпшота.
 */

const indexes = new WeakMap();

function indexDictionary(entries) {
  const index = {
    string: new Set(),
    number: new Set(),
    boolean: new Set(),
  };
  for (const entry of entries) {
    const values = index[typeof entry];
    if (!values) return "invalid";
    if (values.has(entry)) return "duplicate";
    values.add(entry);
  }
  indexes.set(entries, index);
  return null;
}

function dictionaryHas(entries, value) {
  const index = indexes.get(entries);
  const values = index?.[typeof value];
  return values ? values.has(value) : false;
}

module.exports = { indexDictionary, dictionaryHas };
