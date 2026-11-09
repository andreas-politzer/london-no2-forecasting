import type { Matrix } from './linear'
import { scores } from './metrics'

// Small seeded random generator, so the same inputs give the same answer.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type ImportanceGroup = { feature: string; columns: number[] }
export type Importance = { feature: string; increase: number }

// Permutation importance: shuffle the rows of one ingredient (all its columns
// together) in the test data and see how much the mean absolute error grows.
// A large growth means the model leans on that ingredient. Values close to
// zero mean it did not matter for this model on these days.
export function permutationImportance(
  predict: (x: Matrix) => Float64Array,
  x: Matrix,
  actual: Float64Array,
  groups: ImportanceGroup[],
  repeats: number,
  seed: number,
): Importance[] {
  const baseline = scores(actual, predict(x)).mae
  return groups.map((group, g) => {
    const random = mulberry32(seed + g * 7919)
    let total = 0
    for (let r = 0; r < repeats; r += 1) {
      const order = Int32Array.from({ length: x.n }, (_, i) => i)
      for (let i = x.n - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1))
        const tmp = order[i]
        order[i] = order[j]
        order[j] = tmp
      }
      const data = Float64Array.from(x.data)
      for (const column of group.columns) {
        for (let i = 0; i < x.n; i += 1) data[i * x.p + column] = x.data[order[i] * x.p + column]
      }
      total += scores(actual, predict({ n: x.n, p: x.p, data })).mae - baseline
    }
    return { feature: group.feature, increase: total / repeats }
  })
}
