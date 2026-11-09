// Solves A x = b for a symmetric positive definite A (p x p, row-major) with a
// Cholesky factorisation. Returns null when A is not positive definite.
export function solveSpd(a: Float64Array, b: Float64Array, p: number): Float64Array | null {
  const l = new Float64Array(p * p)
  for (let i = 0; i < p; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i * p + j]
      for (let k = 0; k < j; k += 1) sum -= l[i * p + k] * l[j * p + k]
      if (i === j) {
        if (!(sum > 1e-12)) return null
        l[i * p + i] = Math.sqrt(sum)
      } else {
        l[i * p + j] = sum / l[j * p + j]
      }
    }
  }
  const y = new Float64Array(p)
  for (let i = 0; i < p; i += 1) {
    let sum = b[i]
    for (let k = 0; k < i; k += 1) sum -= l[i * p + k] * y[k]
    y[i] = sum / l[i * p + i]
  }
  const x = new Float64Array(p)
  for (let i = p - 1; i >= 0; i -= 1) {
    let sum = y[i]
    for (let k = i + 1; k < p; k += 1) sum -= l[k * p + i] * x[k]
    x[i] = sum / l[i * p + i]
  }
  return x
}
