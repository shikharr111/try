import { test } from "node:test";
import assert from "node:assert/strict";
import { boxMotion, backgroundMotion, toGray, motionThreshold } from "../motion";

const W = 40, H = 30;
const blank = () => new Uint8Array(W * H).fill(100);

test("motion: identical frames give zero", () => {
  assert.equal(boxMotion(blank(), blank(), W, H, { x: 5, y: 5, w: 10, h: 20 }), 0);
});

test("motion: change inside the box is measured, change outside is ignored", () => {
  const a = blank();
  const b = blank();
  for (let y = 8; y < 14; y++) for (let x = 6; x < 14; x++) b[y * W + x] = 200; // 48 px inside the box
  const box = { x: 5, y: 5, w: 10, h: 20 }; // 200 px
  assert.ok(Math.abs(boxMotion(a, b, W, H, box) - 48 / 200) < 1e-9);
  assert.equal(boxMotion(a, b, W, H, { x: 25, y: 5, w: 10, h: 20 }), 0);
  assert.equal(backgroundMotion(a, b, W, H, [box]), 0);
});

test("motion: whole-frame change shows up as background motion (camera shake)", () => {
  const b = new Uint8Array(W * H).fill(200);
  assert.equal(backgroundMotion(blank(), b, W, H, [{ x: 0, y: 0, w: 5, h: 5 }]), 1);
});

test("motion: small brightness noise is not motion; grey conversion works", () => {
  const b = blank().map((v) => v + 5);
  assert.equal(boxMotion(blank(), b, W, H, { x: 0, y: 0, w: W, h: H }), 0);
  assert.equal(toGray([255, 255, 255, 255], 1, 1)[0], 255 * 256 >> 8 > 255 ? 255 : (255 * 77 + 255 * 150 + 255 * 29) >> 8);
  assert.ok(motionThreshold(1) < motionThreshold(0));
});
