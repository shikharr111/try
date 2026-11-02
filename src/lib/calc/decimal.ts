/**
 * Fixed-point decimal arithmetic backed by BigInt (9 fractional digits).
 *
 * Why: quantities, percentages and rates must not accumulate binary floating
 * point error (0.1 + 0.2 !== 0.3). Values coming from Postgres `numeric` arrive
 * as strings and are parsed exactly. Rounding is half away from zero.
 *
 * `toNumber()` exists only for charting/display; never feed its result back
 * into authoritative calculations.
 */

const SCALE_DIGITS = 9;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError("Division by zero");
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const r = an % ad;
  if (r * 2n >= ad) q += 1n;
  return negative ? -q : q;
}

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export type DecInput = Dec | string | number | bigint;

export class Dec {
  private constructor(readonly raw: bigint) {}

  static readonly ZERO = new Dec(0n);
  static readonly ONE = new Dec(SCALE);
  static readonly HUNDRED = new Dec(100n * SCALE);

  /** Parse an exact decimal. Strings are preferred; numbers are converted at 9 dp. */
  static of(value: DecInput): Dec {
    if (value instanceof Dec) return value;
    if (typeof value === "bigint") return new Dec(value * SCALE);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`Not a finite number: ${value}`);
      return Dec.of(value.toFixed(SCALE_DIGITS));
    }
    const m = DECIMAL_RE.exec(value.trim());
    if (!m) throw new TypeError(`Invalid decimal string: "${value}"`);
    const [, sign, intPart, fracPartRaw = ""] = m;
    let frac = fracPartRaw;
    let roundUp = false;
    if (frac.length > SCALE_DIGITS) {
      roundUp = frac.charCodeAt(SCALE_DIGITS) >= 53; // '5'
      frac = frac.slice(0, SCALE_DIGITS);
    }
    frac = frac.padEnd(SCALE_DIGITS, "0");
    let raw = BigInt(intPart) * SCALE + BigInt(frac);
    if (roundUp) raw += 1n;
    return new Dec(sign === "-" ? -raw : raw);
  }

  add(o: DecInput): Dec {
    return new Dec(this.raw + Dec.of(o).raw);
  }
  sub(o: DecInput): Dec {
    return new Dec(this.raw - Dec.of(o).raw);
  }
  mul(o: DecInput): Dec {
    return new Dec(divRound(this.raw * Dec.of(o).raw, SCALE));
  }
  /** Throws RangeError on division by zero; callers must guard denominators. */
  div(o: DecInput): Dec {
    return new Dec(divRound(this.raw * SCALE, Dec.of(o).raw));
  }
  neg(): Dec {
    return new Dec(-this.raw);
  }
  abs(): Dec {
    return this.raw < 0n ? this.neg() : this;
  }

  cmp(o: DecInput): -1 | 0 | 1 {
    const b = Dec.of(o).raw;
    return this.raw < b ? -1 : this.raw > b ? 1 : 0;
  }
  eq(o: DecInput): boolean {
    return this.cmp(o) === 0;
  }
  lt(o: DecInput): boolean {
    return this.cmp(o) < 0;
  }
  lte(o: DecInput): boolean {
    return this.cmp(o) <= 0;
  }
  gt(o: DecInput): boolean {
    return this.cmp(o) > 0;
  }
  gte(o: DecInput): boolean {
    return this.cmp(o) >= 0;
  }
  isZero(): boolean {
    return this.raw === 0n;
  }
  isNegative(): boolean {
    return this.raw < 0n;
  }

  static max(a: DecInput, b: DecInput): Dec {
    const x = Dec.of(a);
    return x.gte(b) ? x : Dec.of(b);
  }
  static min(a: DecInput, b: DecInput): Dec {
    const x = Dec.of(a);
    return x.lte(b) ? x : Dec.of(b);
  }
  static sum(values: Iterable<DecInput>): Dec {
    let acc = 0n;
    for (const v of values) acc += Dec.of(v).raw;
    return new Dec(acc);
  }

  /** Smallest integer >= this value (for whole working days). */
  ceilToInt(): number {
    const q = this.raw / SCALE;
    const hasFraction = this.raw % SCALE !== 0n;
    const result = hasFraction && this.raw > 0n ? q + 1n : q;
    return Number(result);
  }

  /** Round half away from zero to `dp` decimal places and return as Dec. */
  round(dp: number): Dec {
    if (!Number.isInteger(dp) || dp < 0 || dp > SCALE_DIGITS) {
      throw new RangeError(`dp must be an integer in [0, ${SCALE_DIGITS}]`);
    }
    const factor = 10n ** BigInt(SCALE_DIGITS - dp);
    return new Dec(divRound(this.raw, factor) * factor);
  }

  /** Fixed-notation string with exactly `dp` decimals. */
  toFixed(dp: number): string {
    const r = this.round(dp);
    const negative = r.raw < 0n;
    const abs = negative ? -r.raw : r.raw;
    const intPart = abs / SCALE;
    const fracFull = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0");
    const frac = fracFull.slice(0, dp);
    const body = dp > 0 ? `${intPart}.${frac}` : `${intPart}`;
    return negative && r.raw !== 0n ? `-${body}` : body;
  }

  /** Canonical string with trailing zeros trimmed. */
  toString(): string {
    const s = this.toFixed(SCALE_DIGITS);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  }

  /** For charts/display only. */
  toNumber(): number {
    return Number(this.toString());
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Percentage helper: part / whole * 100, or null if whole is zero. */
export function pct(part: DecInput, whole: DecInput): Dec | null {
  const w = Dec.of(whole);
  if (w.isZero()) return null;
  return Dec.of(part).div(w).mul(Dec.HUNDRED);
}
