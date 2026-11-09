export type Scores = { mae: number; rmse: number; bias: number } // bias = mean(prediction - actual)

export function scores(actual: ArrayLike<number>, predicted: ArrayLike<number>): Scores {
  const n = actual.length
  let abs = 0
  let sq = 0
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const e = predicted[i] - actual[i]
    abs += Math.abs(e)
    sq += e * e
    sum += e
  }
  return { mae: abs / n, rmse: Math.sqrt(sq / n), bias: sum / n }
}
