import { solveSpd } from './linalg'

export type Matrix = { n: number; p: number; data: Float64Array } // row-major

export type LinearModel = {
  kept: number[] // indices of the columns that vary in the training data
  mean: Float64Array
  scale: Float64Array
  coef: Float64Array // on standardised columns
  intercept: number
  stabilised: boolean
  predict: (x: Matrix) => Float64Array
}

// Ridge regression on standardised columns. Mean and spread come from the
// training rows only. The penalty acts on the standardised coefficients, the
// intercept is not penalised. This is what scikit-learn's Ridge does on
// standardised input, which is how it is cross-checked in Python.
// Columns without variation are dropped. Returns null if no fit is possible.
export function fitRidge(x: Matrix, y: Float64Array, ridge: number): LinearModel | null {
  const { n, p } = x
  if (n === 0) return null
  const colMean = new Float64Array(p)
  const colScale = new Float64Array(p)
  for (let j = 0; j < p; j += 1) {
    let sum = 0
    for (let i = 0; i < n; i += 1) sum += x.data[i * p + j]
    colMean[j] = sum / n
    let ss = 0
    for (let i = 0; i < n; i += 1) ss += (x.data[i * p + j] - colMean[j]) ** 2
    colScale[j] = Math.sqrt(ss / n)
  }
  const kept: number[] = []
  for (let j = 0; j < p; j += 1) if (colScale[j] > 1e-12) kept.push(j)
  const q = kept.length
  let yMean = 0
  for (let i = 0; i < n; i += 1) yMean += y[i]
  yMean /= n

  const z = new Float64Array(n * q)
  for (let c = 0; c < q; c += 1) {
    const j = kept[c]
    for (let i = 0; i < n; i += 1) z[i * q + c] = (x.data[i * p + j] - colMean[j]) / colScale[j]
  }
  const gram = new Float64Array(q * q)
  const rhs = new Float64Array(q)
  for (let i = 0; i < n; i += 1) {
    const yc = y[i] - yMean
    for (let a = 0; a < q; a += 1) {
      const za = z[i * q + a]
      rhs[a] += za * yc
      for (let b = 0; b <= a; b += 1) gram[a * q + b] += za * z[i * q + b]
    }
  }
  for (let a = 0; a < q; a += 1) {
    for (let b = 0; b < a; b += 1) gram[b * q + a] = gram[a * q + b]
  }

  let coef: Float64Array | null
  let stabilised = false
  if (q === 0) {
    coef = new Float64Array(0)
  } else {
    const trial = (lambda: number) => {
      const a = Float64Array.from(gram)
      for (let d = 0; d < q; d += 1) a[d * q + d] += lambda
      return solveSpd(a, rhs, q)
    }
    coef = trial(ridge)
    if (!coef) {
      stabilised = true
      coef = trial(Math.max(ridge, 1e-8 * n))
    }
    if (!coef) return null
  }
  const fitted = coef

  const predict = (m: Matrix): Float64Array => {
    const out = new Float64Array(m.n)
    for (let i = 0; i < m.n; i += 1) {
      let value = yMean
      for (let c = 0; c < q; c += 1) {
        const j = kept[c]
        value += fitted[c] * ((m.data[i * m.p + j] - colMean[j]) / colScale[j])
      }
      out[i] = value
    }
    return out
  }
  return { kept, mean: colMean, scale: colScale, coef: fitted, intercept: yMean, stabilised, predict }
}
