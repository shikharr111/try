import { test } from "node:test";
import assert from "node:assert/strict";
import { I18N_PAIRS } from "../../../infratrack/i18nHi3";
import { I18N_PAIR_EXACT, I18N_PAIR_TPL, tplHi } from "../../../infratrack/i18nHi2";

test("hindi: every pair is well formed and every template slot is used or deliberately dropped", () => {
  assert.ok(I18N_PAIRS.length > 500);
  for (const [en, hi] of I18N_PAIRS) {
    assert.ok(en.trim().length > 0 && hi.trim().length > 0, `empty pair: ${en}`);
    const used = [...hi.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
    const slots = [...en.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
    for (const u of used) assert.ok(slots.includes(u), `Hindi uses {${u}} that English lacks: ${en}`);
  }
});

test("hindi: templates fill in their numbers and pick the most specific sentence", () => {
  assert.equal(tplHi("About 9 days behind plan"), "योजना से लगभग 9 दिन पीछे");
  assert.equal(tplHi("12 days behind plan"), "योजना से 12 दिन पीछे");
  assert.equal(tplHi("Mon 3 Oct something nobody wrote"), null);
});

test("hindi: a plural suffix slot cannot swallow a whole sentence", () => {
  const long = "Summary, activities (with in-cell bars), progress curve data, daily reports and alerts on separate sheets.";
  assert.equal(tplHi(long), null);
  assert.ok(I18N_PAIR_TPL.length > 100 && Object.keys(I18N_PAIR_EXACT).length > 300);
});
