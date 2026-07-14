/**
 * pdf.js (used by unpdf) references browser globals that exist on Cloudflare
 * Workers but NOT on Vercel's Node serverless runtime — most notably DOMMatrix,
 * which throws "DOMMatrix is not defined" during text extraction.
 *
 * This installs a minimal, correct 2D DOMMatrix (plus harmless stubs for a few
 * other globals pdf.js may touch) so extraction runs in plain Node. Import this
 * module before importing unpdf.
 */

type Mat = [number, number, number, number, number, number] // a,b,c,d,e,f

function parseInit(init?: number[] | string): Mat {
  if (Array.isArray(init)) {
    if (init.length === 6) return [init[0], init[1], init[2], init[3], init[4], init[5]]
    if (init.length === 16) return [init[0], init[1], init[4], init[5], init[12], init[13]]
  }
  if (typeof init === "string") {
    const m = init.match(/matrix\(([^)]+)\)/)
    if (m) {
      const n = m[1].split(",").map((x) => parseFloat(x))
      if (n.length === 6) return n as Mat
    }
  }
  return [1, 0, 0, 1, 0, 0] // identity
}

// (a,b,c,d,e,f) * (a2,b2,c2,d2,e2,f2)
function mul(x: Mat, y: Mat): Mat {
  return [
    x[0] * y[0] + x[2] * y[1],
    x[1] * y[0] + x[3] * y[1],
    x[0] * y[2] + x[2] * y[3],
    x[1] * y[2] + x[3] * y[3],
    x[0] * y[4] + x[2] * y[5] + x[4],
    x[1] * y[4] + x[3] * y[5] + x[5],
  ]
}

class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0

  constructor(init?: number[] | string) {
    const [a, b, c, d, e, f] = parseInit(init)
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f
  }

  get m11() { return this.a } get m12() { return this.b }
  get m21() { return this.c } get m22() { return this.d }
  get m41() { return this.e } get m42() { return this.f }
  get isIdentity() {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
  }

  private self(): Mat { return [this.a, this.b, this.c, this.d, this.e, this.f] }
  private from(m: Mat): DOMMatrixPolyfill {
    const n = new DOMMatrixPolyfill()
    ;[n.a, n.b, n.c, n.d, n.e, n.f] = m
    return n
  }

  multiply(other: DOMMatrixPolyfill) { return this.from(mul(this.self(), other.self())) }
  multiplySelf(other: DOMMatrixPolyfill) { ;[this.a, this.b, this.c, this.d, this.e, this.f] = mul(this.self(), other.self()); return this }
  preMultiplySelf(other: DOMMatrixPolyfill) { ;[this.a, this.b, this.c, this.d, this.e, this.f] = mul(other.self(), this.self()); return this }
  translate(tx = 0, ty = 0) { return this.from(mul(this.self(), [1, 0, 0, 1, tx, ty])) }
  scale(sx = 1, sy = sx) { return this.from(mul(this.self(), [sx, 0, 0, sy, 0, 0])) }
  rotate(deg = 0) { const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r); return this.from(mul(this.self(), [cos, sin, -sin, cos, 0, 0])) }
  inverse() {
    const det = this.a * this.d - this.b * this.c
    if (!det) return this.from([1, 0, 0, 1, 0, 0])
    return this.from([
      this.d / det, -this.b / det, -this.c / det, this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    ])
  }
  toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})` }
}

const g = globalThis as unknown as Record<string, unknown>
if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = DOMMatrixPolyfill as unknown
}
// Harmless stubs for other globals pdf.js may reference during parsing.
if (typeof g.DOMPoint === "undefined") {
  g.DOMPoint = class { x = 0; y = 0; z = 0; w = 1; constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w } }
}
if (typeof (g.Promise as { withResolvers?: unknown }).withResolvers === "undefined") {
  ;(g.Promise as { withResolvers: unknown }).withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void
    let reject!: (r?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
}

export {}
