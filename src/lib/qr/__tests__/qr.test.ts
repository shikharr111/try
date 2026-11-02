import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQr } from "../qr";

test("qr: size grows with text and is square", () => {
  const a = makeQr("hi");
  assert.equal(a.length, 21);
  assert.ok(a.every((r) => r.length === 21));
  const b = makeQr("https://sitepulse-jdby.vercel.app/camera?cam=infratrack-vtifdq");
  assert.equal(b.length, 33); // version 4
});

test("qr: finder pattern corners are dark", () => {
  const m = makeQr("https://example.com/camera?cam=abc");
  for (const [x, y] of [[0, 0], [m.length - 1, 0], [0, m.length - 1]]) assert.equal(m[y][x], true);
});

test("qr: too-long text throws", () => {
  assert.throws(() => makeQr("x".repeat(400)));
});
