"use strict";

function dictionaryEntryMatches(entry, value) {
  if (entry === null || typeof entry !== "object") return entry === value;
  return entry.code === value || entry.value === value;
}

module.exports = { dictionaryEntryMatches };
