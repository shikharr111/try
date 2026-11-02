/**
 * Pixel-change motion inside a person's box. Catches people who work in place (hammering, digging, waving) and so
 * barely move their box centre. All frames are small grey images (one byte per pixel).
 */
export type Box = { x: number; y: number; w: number; h: number };

/** RGBA ImageData bytes -> grey bytes. */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/** Fraction (0..1) of pixels inside `box` whose grey level changed by more than `diffThr`. */
export function boxMotion(prev: Uint8Array, cur: Uint8Array, w: number, h: number, box: Box, diffThr = 28): number {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(w, Math.ceil(box.x + box.w));
  const y1 = Math.min(h, Math.ceil(box.y + box.h));
  let n = 0;
  let c = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      n++;
      if (Math.abs(prev[y * w + x] - cur[y * w + x]) > diffThr) c++;
    }
  }
  return n ? c / n : 0;
}

/** Fraction of pixels OUTSIDE all boxes that changed: a high value means the whole camera is shaking. */
export function backgroundMotion(prev: Uint8Array, cur: Uint8Array, w: number, h: number, boxes: Box[], diffThr = 28): number {
  const skip = new Uint8Array(w * h);
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x));
    const y0 = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(w, Math.ceil(b.x + b.w));
    const y1 = Math.min(h, Math.ceil(b.y + b.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) skip[y * w + x] = 1;
  }
  let n = 0;
  let c = 0;
  for (let i = 0; i < skip.length; i++) {
    if (skip[i]) continue;
    n++;
    if (Math.abs(prev[i] - cur[i]) > diffThr) c++;
  }
  return n ? c / n : 0;
}

/** Sensitivity 0..1 -> share of changed pixels inside a box that counts as "moving". */
export const motionThreshold = (sens: number): number => 0.18 - sens * 0.12;
