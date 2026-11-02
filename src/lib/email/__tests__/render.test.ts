import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDprPayload, renderDprEmail, renderReminderEmail, isCronAuthorized, resendRequest, esc } from "../render";

const good = { projectName: "Ring Road", date: "2026-11-02", sections: [{ title: "WORK PROGRESS", lines: ["Earthwork: +1200 m³", "Culvert: +2 nos"] }] };

test("email: valid payload is accepted and rendered", () => {
  const p = parseDprPayload(good)!;
  assert.ok(p);
  const m = renderDprEmail(p);
  assert.equal(m.subject, "Daily Progress Report — Ring Road — 02/11/2026");
  assert.match(m.text, /WORK PROGRESS\n {2}- Earthwork: \+1200 m³/);
  assert.match(m.html, /<li[^>]*>Culvert: \+2 nos<\/li>/);
});

test("email: HTML is escaped (no script injection through report text)", () => {
  const p = parseDprPayload({ projectName: "<b>X</b>", date: "2026-11-02", sections: [{ title: "T", lines: ['<script>alert(1)</script> "q"'] }] })!;
  const m = renderDprEmail(p);
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;q&quot;/);
  assert.equal(esc("<&>"), "&lt;&amp;&gt;");
});

test("email: bad or oversized payloads are rejected", () => {
  assert.equal(parseDprPayload(null), null);
  assert.equal(parseDprPayload({ ...good, date: "02-11-2026" }), null);
  assert.equal(parseDprPayload({ ...good, projectName: "" }), null);
  assert.equal(parseDprPayload({ ...good, sections: "x" }), null);
  assert.equal(parseDprPayload({ ...good, sections: Array(21).fill({ title: "a", lines: [] }) }), null);
  assert.equal(parseDprPayload({ ...good, sections: [{ title: "a", lines: Array(201).fill("x") }] }), null);
  const long = parseDprPayload({ ...good, sections: [{ title: "a", lines: ["y".repeat(900)] }] })!;
  assert.equal(long.sections[0].lines[0].length, 500);
});

test("email: empty report still renders", () => {
  const m = renderDprEmail(parseDprPayload({ ...good, sections: [] })!);
  assert.match(m.text, /Nothing was entered/);
});

test("reminder: contains the workspace link", () => {
  const m = renderReminderEmail("https://site.example/");
  assert.match(m.text, /https:\/\/site\.example\/workspace/);
  assert.match(m.html, /href="https:\/\/site\.example\/workspace"/);
});

test("cron auth: only the exact secret passes, and never without a strong secret", () => {
  const secret = "a-long-random-secret-123";
  assert.equal(isCronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(isCronAuthorized(`Bearer ${secret}x`, secret), false);
  assert.equal(isCronAuthorized("Bearer wrong-secret-0000000", secret), false);
  assert.equal(isCronAuthorized(null, secret), false);
  assert.equal(isCronAuthorized(`Bearer `, ""), false);
  assert.equal(isCronAuthorized("Bearer short", "short"), false);
});

test("resend request: recipient is a single address and key is in the header only", () => {
  const r = resendRequest("re_key", "A <a@b.c>", "me@x.y", { subject: "s", text: "t", html: "h" });
  assert.equal(r.url, "https://api.resend.com/emails");
  assert.equal(r.init.headers.Authorization, "Bearer re_key");
  const b = JSON.parse(r.init.body);
  assert.deepEqual(b.to, ["me@x.y"]);
  assert.doesNotMatch(r.init.body, /re_key/);
});
