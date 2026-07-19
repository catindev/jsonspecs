module.exports = function(rule, ctx) {
  try {
    const got = ctx.get(rule.field);
    if (!got.ok || got.value === null || got.value === undefined || got.value === "") return { status: "OK" };
    return { status: got.value === true ? "FAIL" : "OK" };
  } catch (e) { return { status: "EXCEPTION", error: e }; }
};
