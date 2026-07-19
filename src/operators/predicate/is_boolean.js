module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok) return { status: "UNDEFINED" };
    return { status: typeof got.value === "boolean" ? "TRUE" : "FALSE" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
