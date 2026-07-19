module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok) return { status: "FAIL" };
    return { status: typeof got.value === "string" ? "OK" : "FAIL" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
